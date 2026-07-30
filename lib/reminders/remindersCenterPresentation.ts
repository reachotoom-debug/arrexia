import { formatMoney } from "@/lib/utils/format-money";
import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import { resolveWorkspaceEvaluationDate } from "@/lib/datetime/workspaceCalendar";
import { formatRuleWhenText } from "./shared";
import type { EligibleReminderCandidate } from "./getEligibleReminders";
import { computeOutstandingByCurrency } from "@/lib/actions/collectionActivity";
import { automationGateSkipMessage, type AutomationGateSkipReason } from "./automationGate";

/** Keep in sync with vercel.json crons[0].schedule for /api/internal/reminders/run */
export const REMINDER_AUTOMATION_CRON_UTC = "0 6 * * *";
export const REMINDER_AUTOMATION_CRON_LABEL = "Daily at 6:00 AM UTC";

export type ReminderRuleCountRow = {
  is_enabled: boolean | null;
};

export type ReminderHistoryMetricRow = {
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

export type ReadyRemindersSummary = {
  readyCount: number;
  distinctCustomerCount: number;
  distinctRuleCount: number;
  outstandingLabel: string;
  outstandingDetail?: string;
};

export type HistoryRemindersSummary = {
  sentToday: number;
  failedToday: number;
  last30DaysCompleted: number;
  successRateLabel: string;
};

export type AutomationStatusPresentation = {
  statusLabel: "Enabled" | "Disabled" | "Unknown";
  statusDetail: string;
  activeRules: number;
  disabledRules: number;
  scheduleLabel: string | null;
  settingsHref: string;
};

export function formatHumanReminderRuleLabel(params: {
  triggerType: string;
  offsetDays: number;
  ruleName?: string | null;
}): string {
  const { triggerType, offsetDays, ruleName } = params;
  const abs = Math.abs(Number(offsetDays ?? 0));

  if (triggerType === "on_due" || (triggerType === "relative_to_due_date" && offsetDays === 0)) {
    return "First Reminder";
  }

  if (triggerType === "before_due") {
    if (abs === 3) return "Pre-Due Reminder";
    return `${abs}-Day Pre-Due Reminder`;
  }

  if (triggerType === "after_due" || (triggerType === "relative_to_due_date" && offsetDays > 0)) {
    if (abs === 3) return "3-Day Reminder";
    if (abs === 7) return "7-Day Reminder";
    if (abs === 14) return "14-Day Reminder";
    if (abs === 15) return "15-Day Follow-up";
    if (abs === 30) return "30-Day Follow-up";
    if (abs === 60) return "Final Notice";
    if (abs === 90) return "Final Notice";
    return `${abs}-Day Reminder`;
  }

  const trimmedName = ruleName?.trim();
  if (trimmedName) return trimmedName;

  return formatRuleWhenText(triggerType, offsetDays);
}

export function formatReminderActionReason(params: {
  triggerType: string;
  offsetDays: number;
  daysFromDue: number | null;
  isOverdue: boolean;
}): string {
  const { triggerType, offsetDays, daysFromDue, isOverdue } = params;
  const abs = Math.abs(Number(offsetDays ?? 0));

  if (triggerType === "before_due") {
    return "Scheduled reminder due today";
  }

  if (triggerType === "on_due" || (triggerType === "relative_to_due_date" && offsetDays === 0)) {
    return isOverdue ? "First overdue follow-up" : "Scheduled reminder due today";
  }

  if (isOverdue && daysFromDue !== null && daysFromDue >= 1 && daysFromDue <= 6) {
    return "First overdue follow-up";
  }

  if (triggerType === "after_due" || (triggerType === "relative_to_due_date" && offsetDays > 0)) {
    if (abs === 7) return "7-day follow-up";
    if (abs === 14 || abs === 15) return "14-day follow-up";
    if (abs === 30) return "30-day escalation";
    if (abs >= 60) return "Final escalation";
    return `${abs}-day follow-up`;
  }

  return "Scheduled reminder due today";
}

export function normalizeReminderFailureReason(
  raw: string | null | undefined
): string {
  if (!raw?.trim()) {
    return "Email delivery failed";
  }

  const message = raw.split("\n")[0]?.trim() ?? "";
  const lower = message.toLowerCase();

  if (lower.includes("domain") && (lower.includes("verify") || lower.includes("verified"))) {
    return "Sender domain not verified";
  }
  if (lower.includes("only send testing emails") || lower.includes("onboarding@resend.dev")) {
    return "Provider rejected recipient";
  }
  if (lower.includes("recipient") && (lower.includes("invalid") || lower.includes("rejected"))) {
    return "Provider rejected recipient";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Email send timed out";
  }
  if (lower.includes("mailbox") && lower.includes("unavailable")) {
    return "Mailbox unavailable";
  }
  if (
    lower.includes("authentication") ||
    lower.includes("auth") ||
    lower.includes("credentials")
  ) {
    return "Authentication failed";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Rate limited";
  }

  return "Email delivery failed";
}

export function countReminderRules(rules: ReminderRuleCountRow[]): {
  activeRules: number;
  disabledRules: number;
} {
  let activeRules = 0;
  let disabledRules = 0;

  for (const rule of rules) {
    if (rule.is_enabled) {
      activeRules += 1;
    } else {
      disabledRules += 1;
    }
  }

  return { activeRules, disabledRules };
}

export function buildAutomationStatusPresentation(params: {
  workspaceId: string;
  automationAllowed: boolean;
  skipReason?: AutomationGateSkipReason;
  rules: ReminderRuleCountRow[];
  settingsLoaded: boolean;
}): AutomationStatusPresentation {
  const { workspaceId, automationAllowed, skipReason, rules, settingsLoaded } = params;
  const { activeRules, disabledRules } = countReminderRules(rules);

  if (!settingsLoaded) {
    return {
      statusLabel: "Unknown",
      statusDetail: "Automation status could not be verified.",
      activeRules,
      disabledRules,
      scheduleLabel: null,
      settingsHref: `/${workspaceId}/settings?section=reminders`,
    };
  }

  if (automationAllowed) {
    return {
      statusLabel: "Enabled",
      statusDetail:
        "Automatic reminders are enabled and will run on the configured schedule.",
      activeRules,
      disabledRules,
      scheduleLabel: REMINDER_AUTOMATION_CRON_LABEL,
      settingsHref: `/${workspaceId}/settings?section=reminders`,
    };
  }

  const detail =
    skipReason != null
      ? automationGateSkipMessage(skipReason)
      : "Automatic reminders are disabled for this workspace.";

  return {
    statusLabel: "Disabled",
    statusDetail: detail,
    activeRules,
    disabledRules,
    scheduleLabel: null,
    settingsHref: `/${workspaceId}/settings?section=reminders`,
  };
}

export function computeReadyRemindersSummary(
  candidates: Array<
    Pick<
      EligibleReminderCandidate,
      "clientId" | "ruleId" | "outstanding" | "currency"
    >
  >,
  defaultCurrency = "USD"
): ReadyRemindersSummary {
  const readyCount = candidates.length;
  const distinctCustomerCount = new Set(
    candidates.map((row) => row.clientId).filter(Boolean)
  ).size;
  const distinctRuleCount = new Set(candidates.map((row) => row.ruleId)).size;

  const totals = computeOutstandingByCurrency({
    outstandingAmounts: candidates.map((row) => ({
      outstanding: row.outstanding,
      currency: row.currency,
    })),
    defaultCurrency,
  });

  if (totals.length === 0) {
    return {
      readyCount,
      distinctCustomerCount,
      distinctRuleCount,
      outstandingLabel: formatMoney(0, defaultCurrency),
    };
  }

  if (totals.length === 1) {
    const only = totals[0]!;
    return {
      readyCount,
      distinctCustomerCount,
      distinctRuleCount,
      outstandingLabel: formatMoney(only.amount, only.currency),
    };
  }

  return {
    readyCount,
    distinctCustomerCount,
    distinctRuleCount,
    outstandingLabel: totals.map((row) => formatMoney(row.amount, row.currency)).join(" · "),
    outstandingDetail: "Totals shown separately by currency.",
  };
}

function resolveHistoryAttemptInstant(row: ReminderHistoryMetricRow): string | null {
  return row.sent_at ?? row.created_at ?? null;
}

function isCompletedAttemptStatus(status: string | null | undefined): boolean {
  return status === "sent" || status === "failed";
}

export function computeHistoryRemindersSummary(params: {
  rows: ReminderHistoryMetricRow[];
  workspaceTimeZone: string;
  evaluationInstant?: Date;
}): HistoryRemindersSummary {
  const { rows, workspaceTimeZone } = params;
  const evaluationInstant = params.evaluationInstant ?? new Date();
  const today = resolveWorkspaceEvaluationDate(evaluationInstant, workspaceTimeZone);

  const thirtyDaysAgo = new Date(evaluationInstant);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const thirtyDaysAgoMs = thirtyDaysAgo.getTime();

  let sentToday = 0;
  let failedToday = 0;
  let sentLast30 = 0;
  let failedLast30 = 0;

  for (const row of rows) {
    if (!isCompletedAttemptStatus(row.status)) continue;

    const instant = resolveHistoryAttemptInstant(row);
    if (!instant) continue;

    const attemptDate = new Date(instant);
    if (Number.isNaN(attemptDate.getTime())) continue;

    const calendarDate = instantToWorkspaceCalendarDate(instant, workspaceTimeZone);
    const inLast30 = attemptDate.getTime() >= thirtyDaysAgoMs;

    if (!inLast30) continue;

    if (row.status === "sent") {
      sentLast30 += 1;
      if (calendarDate === today) sentToday += 1;
    } else if (row.status === "failed") {
      failedLast30 += 1;
      if (calendarDate === today) failedToday += 1;
    }
  }

  const completedAttempts = sentLast30 + failedLast30;
  const successRateLabel =
    completedAttempts === 0
      ? "—"
      : `${Math.round((sentLast30 / completedAttempts) * 100)}%`;

  return {
    sentToday,
    failedToday,
    last30DaysCompleted: completedAttempts,
    successRateLabel,
  };
}

export function formatExposureLabelFromTotals(
  totals: Array<{ currency: string; amount: number }>,
  defaultCurrency = "USD"
): { value: string; detail?: string } {
  if (totals.length === 0) {
    return { value: formatMoney(0, defaultCurrency) };
  }
  if (totals.length === 1) {
    const only = totals[0]!;
    return { value: formatMoney(only.amount, only.currency) };
  }
  return {
    value: totals.map((row) => formatMoney(row.amount, row.currency)).join(" · "),
    detail: "Totals shown separately by currency.",
  };
}
