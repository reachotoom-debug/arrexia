/**
 * Canonical pure reminder eligibility domain (R2A).
 * No Supabase, no I/O — deterministic workspace-local calendar evaluation.
 */

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  computeInvoiceTimingFromCalendarDates,
  computeScheduledDateForRule,
  differenceCalendarDays,
  matchesReminderRuleTrigger,
} from "./ruleTrigger";

/** Stored rule scope values from Settings schema + DB defaults. */
export const REMINDER_RULE_FOR_STATUS_VALUES = [
  "any",
  "sent",
  "partially_paid",
  "overdue",
  "draft",
] as const;

export type ReminderRuleForStatus = (typeof REMINDER_RULE_FOR_STATUS_VALUES)[number];

/** Invoice base_status values that must never receive collection reminders. */
export const NON_COLLECTIBLE_BASE_STATUSES = ["draft", "void"] as const;

export type ReminderEligibilityReason =
  | "eligible"
  | "rule_disabled"
  | "invoice_archived"
  | "client_archived"
  | "invoice_not_collectible"
  | "no_outstanding_balance"
  | "status_not_allowed"
  | "missing_due_date"
  | "trigger_not_due"
  | "already_sent_for_rule"
  | "unsupported_trigger_type"
  | "unsupported_for_status";

export interface ReminderEligibilityResult {
  eligible: boolean;
  reason: ReminderEligibilityReason;
  daysFromDueDate?: number;
  scheduledDate?: string;
}

export interface ReminderRuleEligibilityInput {
  id: string;
  isEnabled: boolean;
  triggerType: string;
  offsetDays: number;
  forStatus: string | null;
}

export interface ReminderInvoiceEligibilityInput {
  dueDate: string | null;
  outstanding: number;
  paid: number;
  baseStatus: string | null;
  archivedAt?: string | null;
  clientArchivedAt?: string | null;
  /** Preserved for callers; inactive clients are NOT excluded in R2A. */
  clientIsActive?: boolean | null;
}

export interface ReminderHistoryEntry {
  ruleId: string | null;
  status: string;
  sentAt: string | null;
}

export interface ReminderEligibilityInput {
  /** Workspace-local calendar date (YYYY-MM-DD) for evaluation. */
  evaluationDate: string;
  /** IANA timezone used to map reminder sent_at to a calendar date for duplicate checks. */
  workspaceTimeZone?: string | null;
  rule: ReminderRuleEligibilityInput;
  invoice: ReminderInvoiceEligibilityInput;
  history: ReminderHistoryEntry[];
}

function ineligible(
  reason: Exclude<ReminderEligibilityReason, "eligible">,
  extras: Partial<Pick<ReminderEligibilityResult, "daysFromDueDate" | "scheduledDate">> = {}
): ReminderEligibilityResult {
  return { eligible: false, reason, ...extras };
}

function eligibleResult(
  extras: Partial<Pick<ReminderEligibilityResult, "daysFromDueDate" | "scheduledDate">> = {}
): ReminderEligibilityResult {
  return { eligible: true, reason: "eligible", ...extras };
}

export function normalizeBaseStatus(
  baseStatus: string | null | undefined
): string | null {
  if (!baseStatus) return null;
  return baseStatus.trim().toLowerCase();
}

export function isFinanciallyPartiallyPaid(
  paid: number,
  outstanding: number
): boolean {
  return paid > 0 && outstanding > 0;
}

export function isOverdueOnDate(
  evaluationDate: string,
  dueDate: string,
  outstanding: number
): boolean {
  if (outstanding <= 0) return false;
  const diff = differenceCalendarDays(evaluationDate, dueDate);
  return diff !== null && diff > 0;
}

export function isNonCollectibleBaseStatus(baseStatus: string | null): boolean {
  if (!baseStatus) return false;
  return (NON_COLLECTIBLE_BASE_STATUSES as readonly string[]).includes(baseStatus);
}

export function isUnrestrictedForStatus(forStatus: string | null | undefined): boolean {
  if (forStatus == null) return true;
  const normalized = forStatus.trim().toLowerCase();
  return normalized === "" || normalized === "any";
}

export type ReminderRuleScopedForStatus = Exclude<
  ReminderRuleForStatus,
  "any"
>;

export function normalizeForStatus(
  forStatus: string | null | undefined
): ReminderRuleScopedForStatus | null | "unsupported" {
  if (isUnrestrictedForStatus(forStatus)) return null;
  const normalized = forStatus!.trim().toLowerCase();
  const scopedValues: readonly ReminderRuleScopedForStatus[] = [
    "sent",
    "partially_paid",
    "overdue",
    "draft",
  ];
  if (scopedValues.includes(normalized as ReminderRuleScopedForStatus)) {
    return normalized as ReminderRuleScopedForStatus;
  }
  return "unsupported";
}

export function matchesReminderForStatus(
  forStatus: ReminderRuleScopedForStatus,
  invoice: ReminderInvoiceEligibilityInput,
  evaluationDate: string,
  dueDate: string
): boolean {
  switch (forStatus) {
    case "sent":
      return normalizeBaseStatus(invoice.baseStatus) === "sent";
    case "partially_paid":
      return isFinanciallyPartiallyPaid(invoice.paid, invoice.outstanding);
    case "overdue":
      return isOverdueOnDate(evaluationDate, dueDate, invoice.outstanding);
    case "draft":
      return normalizeBaseStatus(invoice.baseStatus) === "draft";
    default:
      return true;
  }
}

export function isSupportedTriggerType(triggerType: string): boolean {
  return (
    triggerType === "before_due" ||
    triggerType === "on_due" ||
    triggerType === "after_due"
  );
}

export function sentHistoryBlocksRuleOccurrence(
  history: ReminderHistoryEntry[],
  ruleId: string,
  scheduledDate: string,
  workspaceTimeZone: string | null | undefined
): boolean {
  for (const entry of history) {
    if (entry.ruleId !== ruleId) continue;
    if (entry.status !== "sent") continue;
    if (!entry.sentAt) continue;

    const sentCalendarDate = instantToWorkspaceCalendarDate(
      entry.sentAt,
      workspaceTimeZone
    );
    if (sentCalendarDate === scheduledDate) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether an invoice is eligible for a specific reminder rule
 * on a workspace-local evaluation date.
 */
export function evaluateReminderEligibility(
  input: ReminderEligibilityInput
): ReminderEligibilityResult {
  const { evaluationDate, rule, invoice, history } = input;
  const workspaceTimeZone = input.workspaceTimeZone ?? "UTC";

  if (!rule.isEnabled) {
    return ineligible("rule_disabled");
  }

  if (invoice.archivedAt) {
    return ineligible("invoice_archived");
  }

  if (invoice.clientArchivedAt) {
    return ineligible("client_archived");
  }

  if (!invoice.dueDate) {
    return ineligible("missing_due_date");
  }

  const dueDate = invoice.dueDate.slice(0, 10);

  if (!(invoice.outstanding > 0)) {
    return ineligible("no_outstanding_balance");
  }

  const baseStatus = normalizeBaseStatus(invoice.baseStatus);
  if (isNonCollectibleBaseStatus(baseStatus)) {
    return ineligible("invoice_not_collectible");
  }

  const scopedForStatus = normalizeForStatus(rule.forStatus);
  if (scopedForStatus === "unsupported") {
    return ineligible("unsupported_for_status");
  }
  if (
    scopedForStatus &&
    !matchesReminderForStatus(scopedForStatus, invoice, evaluationDate, dueDate)
  ) {
    return ineligible("status_not_allowed");
  }

  if (!isSupportedTriggerType(rule.triggerType)) {
    return ineligible("unsupported_trigger_type");
  }

  const scheduledDate = computeScheduledDateForRule(
    dueDate,
    rule.triggerType,
    rule.offsetDays
  );
  if (!scheduledDate) {
    return ineligible("unsupported_trigger_type");
  }

  const daysFromDueDate = differenceCalendarDays(evaluationDate, dueDate);
  const timing = computeInvoiceTimingFromCalendarDates(evaluationDate, dueDate);
  const triggerMatches = matchesReminderRuleTrigger(
    timing,
    rule.triggerType,
    rule.offsetDays
  );

  if (!triggerMatches || evaluationDate !== scheduledDate) {
    return ineligible("trigger_not_due", {
      daysFromDueDate: daysFromDueDate ?? undefined,
      scheduledDate,
    });
  }

  if (
    sentHistoryBlocksRuleOccurrence(
      history,
      rule.id,
      scheduledDate,
      workspaceTimeZone
    )
  ) {
    return ineligible("already_sent_for_rule", {
      daysFromDueDate: daysFromDueDate ?? undefined,
      scheduledDate,
    });
  }

  return eligibleResult({
    daysFromDueDate: daysFromDueDate ?? undefined,
    scheduledDate,
  });
}
