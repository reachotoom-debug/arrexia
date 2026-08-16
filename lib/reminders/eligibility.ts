/**
 * Canonical pure reminder eligibility domain (R2A).
 * No Supabase, no I/O — deterministic workspace-local calendar evaluation.
 */

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  computeLatestRecurringOccurrence,
  findFinalAfterDueRule,
  RECURRING_CONTACT_COOLDOWN_DAYS,
  RECURRING_OVERDUE_INTERVAL_DAYS,
  type AfterDueRuleRef,
} from "./recurringChase";
import {
  addCalendarDays,
  computeScheduledDateForRule,
  differenceCalendarDays,
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
  | "client_inactive"
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
  /** Inactive clients must not receive reminders (P1B lifecycle contract). */
  clientIsActive?: boolean | null;
}

export interface ReminderHistoryEntry {
  ruleId: string | null;
  status: string;
  sentAt: string | null;
  /** Workspace-calendar logical occurrence date (YYYY-MM-DD). */
  scheduledAt?: string | null;
  /** Delivery channel when known; only email contacts establish cooldown. */
  channel?: string | null;
}

export interface ReminderEligibilityInput {
  /** Workspace-local calendar date (YYYY-MM-DD) for evaluation. */
  evaluationDate: string;
  /** IANA timezone used to map reminder sent_at to a calendar date for duplicate checks. */
  workspaceTimeZone?: string | null;
  rule: ReminderRuleEligibilityInput;
  invoice: ReminderInvoiceEligibilityInput;
  history: ReminderHistoryEntry[];
  /**
   * True when invoice_delivery_logs contains a successful send on the invoice due date
   * (workspace calendar). Satisfies the on_due occurrence only — not general history.
   */
  successfulInvoiceDeliveryOnDueDate?: boolean;
}

export type RuleOccurrenceRef = {
  id: string;
  triggerType: string;
  offsetDays: number;
};

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

/** Resolve the logical occurrence date stored on or implied by a history row. */
export function resolveEntryOccurrenceScheduledDate(
  entry: ReminderHistoryEntry,
  rule: { triggerType: string; offsetDays: number } | undefined,
  dueDate: string
): string | null {
  if (entry.scheduledAt) {
    return entry.scheduledAt.slice(0, 10);
  }

  if (!rule) return null;

  return computeScheduledDateForRule(
    dueDate,
    rule.triggerType,
    rule.offsetDays
  );
}

/**
 * Occurrence duplicate guard: workspace + invoice + ruleId + scheduledDate.
 * Legacy rows (scheduled_at NULL) satisfy only the static one-shot date for that rule.
 */
export function sentHistoryBlocksRuleOccurrence(
  history: ReminderHistoryEntry[],
  ruleId: string,
  scheduledDate: string,
  _workspaceTimeZone?: string | null | undefined,
  rule?: { triggerType: string; offsetDays: number },
  dueDate?: string
): boolean {
  if (!dueDate || !rule) {
    return history.some(
      (entry) =>
        entry.ruleId === ruleId &&
        entry.status === "sent" &&
        entry.scheduledAt?.slice(0, 10) === scheduledDate
    );
  }

  for (const entry of history) {
    if (entry.ruleId !== ruleId || entry.status !== "sent") continue;

    const entryScheduled = resolveEntryOccurrenceScheduledDate(entry, rule, dueDate);
    if (entryScheduled === scheduledDate) {
      return true;
    }
  }

  return false;
}

/** Whether a rule occurrence's scheduledDate has arrived and catch-up still applies. */
export function isOccurrenceCatchUpEligible(params: {
  evaluationDate: string;
  dueDate: string;
  scheduledDate: string;
  triggerType: string;
}): boolean {
  const { evaluationDate, dueDate, scheduledDate, triggerType } = params;

  if (scheduledDate > evaluationDate) {
    return false;
  }

  if (triggerType === "before_due") {
    return evaluationDate <= dueDate;
  }

  if (triggerType === "on_due") {
    return dueDate <= evaluationDate;
  }

  if (triggerType === "after_due") {
    return scheduledDate <= evaluationDate;
  }

  return false;
}

export function getLatestManualSentCalendarDate(
  history: ReminderHistoryEntry[],
  workspaceTimeZone: string | null | undefined
): string | null {
  let latest: string | null = null;

  for (const entry of history) {
    if (entry.ruleId !== null) continue;
    if (entry.status !== "sent") continue;
    if (!entry.sentAt) continue;

    const sentCalendarDate = instantToWorkspaceCalendarDate(
      entry.sentAt,
      workspaceTimeZone
    );
    if (!sentCalendarDate) continue;

    if (latest === null || sentCalendarDate > latest) {
      latest = sentCalendarDate;
    }
  }

  return latest;
}

/** Latest workspace-calendar date of any successful collection email (rule-bound or manual). */
export function getLatestSuccessfulCollectionEmailDate(
  history: ReminderHistoryEntry[],
  workspaceTimeZone: string | null | undefined
): string | null {
  let latest: string | null = null;

  for (const entry of history) {
    if (entry.status !== "sent") continue;
    if (entry.channel === "whatsapp") continue;
    if (!entry.sentAt) continue;

    const sentCalendarDate = instantToWorkspaceCalendarDate(
      entry.sentAt,
      workspaceTimeZone
    );
    if (!sentCalendarDate) continue;

    if (latest === null || sentCalendarDate > latest) {
      latest = sentCalendarDate;
    }
  }

  return latest;
}

/**
 * Recurring chase contact cadence: block when a successful collection email
 * was sent fewer than cooldownDays ago (workspace-local calendar).
 */
export function isRecurringContactCooldownActive(params: {
  evaluationDate: string;
  history: ReminderHistoryEntry[];
  workspaceTimeZone?: string | null;
  cooldownDays?: number;
}): boolean {
  const cooldownDays = params.cooldownDays ?? RECURRING_CONTACT_COOLDOWN_DAYS;
  const lastContact = getLatestSuccessfulCollectionEmailDate(
    params.history,
    params.workspaceTimeZone
  );
  if (!lastContact) return false;

  const daysSinceContact = differenceCalendarDays(
    params.evaluationDate,
    lastContact
  );
  if (daysSinceContact === null) return false;

  return daysSinceContact < cooldownDays;
}

/** Max scheduledDate among automated (rule-bound) successful sends. */
export function getMaxAutomatedSatisfiedScheduledDate(params: {
  history: ReminderHistoryEntry[];
  rules: RuleOccurrenceRef[];
  dueDate: string;
}): string | null {
  const ruleById = new Map(params.rules.map((rule) => [rule.id, rule]));
  let max: string | null = null;

  for (const entry of params.history) {
    if (entry.status !== "sent" || !entry.ruleId) continue;
    const rule = ruleById.get(entry.ruleId);
    if (!rule) continue;

    const scheduledDate = resolveEntryOccurrenceScheduledDate(
      entry,
      rule,
      params.dueDate
    );
    if (!scheduledDate) continue;

    if (max === null || scheduledDate > max) {
      max = scheduledDate;
    }
  }

  return max;
}

/**
 * Latest applicable occurrence (one-shot static dates + recurring) on or before evaluationDate.
 */
export function computeLatestApplicableOccurrenceDate(params: {
  dueDate: string;
  rules: AfterDueRuleRef[];
  evaluationDate: string;
  recurringIntervalDays?: number;
}): string | null {
  const intervalDays = params.recurringIntervalDays ?? RECURRING_OVERDUE_INTERVAL_DAYS;
  let max: string | null = null;

  for (const rule of params.rules) {
    const staticDate = computeScheduledDateForRule(
      params.dueDate,
      rule.triggerType,
      rule.offsetDays
    );
    if (!staticDate || staticDate > params.evaluationDate) continue;
    if (max === null || staticDate > max) max = staticDate;
  }

  const finalRule = findFinalAfterDueRule(params.rules);
  if (finalRule) {
    const recurring = computeLatestRecurringOccurrence({
      dueDate: params.dueDate,
      finalOffsetDays: Number(finalRule.offsetDays ?? 0),
      intervalDays,
      evaluationDate: params.evaluationDate,
    });
    if (recurring && (max === null || recurring.scheduledDate > max)) {
      max = recurring.scheduledDate;
    }
  }

  return max;
}

/**
 * Manual email satisfies the currently due occurrence when it is the latest applicable
 * occurrence on or before the manual send date (does not shift the recurrence calendar).
 */
export function manualEmailSatisfiesOccurrence(params: {
  history: ReminderHistoryEntry[];
  scheduledDate: string;
  dueDate: string;
  rules: AfterDueRuleRef[];
  workspaceTimeZone?: string | null;
  recurringIntervalDays?: number;
}): boolean {
  const manualDate = getLatestManualSentCalendarDate(
    params.history,
    params.workspaceTimeZone
  );
  if (!manualDate) return false;
  if (params.scheduledDate > manualDate) return false;

  const maxAutomated = getMaxAutomatedSatisfiedScheduledDate({
    history: params.history,
    rules: params.rules,
    dueDate: params.dueDate,
  });
  if (maxAutomated && params.scheduledDate <= maxAutomated) return false;
  if (maxAutomated && manualDate <= maxAutomated) return false;

  const latestApplicable = computeLatestApplicableOccurrenceDate({
    dueDate: params.dueDate,
    rules: params.rules,
    evaluationDate: manualDate,
    recurringIntervalDays: params.recurringIntervalDays,
  });

  return latestApplicable === params.scheduledDate;
}

/**
 * Successful invoice email delivery on the due date satisfies the canonical on_due occurrence.
 * Does not affect other trigger types or general reminder/cooldown history.
 */
export function invoiceDeliverySatisfiesOnDueOccurrence(params: {
  triggerType: string;
  scheduledDate: string;
  dueDate: string;
  successfulInvoiceDeliveryOnDueDate: boolean;
}): boolean {
  if (!params.successfulInvoiceDeliveryOnDueDate) {
    return false;
  }
  if (params.triggerType !== "on_due") {
    return false;
  }
  const due = params.dueDate.slice(0, 10);
  return params.scheduledDate === due;
}

export function isOccurrenceSatisfied(params: {
  history: ReminderHistoryEntry[];
  ruleId: string;
  scheduledDate: string;
  rule: { triggerType: string; offsetDays: number };
  dueDate: string;
  workspaceTimeZone?: string | null;
  allRules?: AfterDueRuleRef[];
  successfulInvoiceDeliveryOnDueDate?: boolean;
}): boolean {
  if (
    sentHistoryBlocksRuleOccurrence(
      params.history,
      params.ruleId,
      params.scheduledDate,
      params.workspaceTimeZone,
      params.rule,
      params.dueDate
    )
  ) {
    return true;
  }

  if (
    invoiceDeliverySatisfiesOnDueOccurrence({
      triggerType: params.rule.triggerType,
      scheduledDate: params.scheduledDate,
      dueDate: params.dueDate,
      successfulInvoiceDeliveryOnDueDate:
        params.successfulInvoiceDeliveryOnDueDate ?? false,
    })
  ) {
    return true;
  }

  if (!params.allRules || params.allRules.length === 0) {
    return false;
  }

  return manualEmailSatisfiesOccurrence({
    history: params.history,
    scheduledDate: params.scheduledDate,
    dueDate: params.dueDate,
    rules: params.allRules,
    workspaceTimeZone: params.workspaceTimeZone,
  });
}

/** Latest scheduledDate among all satisfied occurrences (automated + manual). */
export function getMaxSatisfiedOccurrenceScheduledDate(params: {
  history: ReminderHistoryEntry[];
  rules: RuleOccurrenceRef[];
  dueDate: string;
  workspaceTimeZone?: string | null;
  recurringIntervalDays?: number;
}): string | null {
  const automatedMax = getMaxAutomatedSatisfiedScheduledDate({
    history: params.history,
    rules: params.rules,
    dueDate: params.dueDate,
  });

  const manualDate = getLatestManualSentCalendarDate(
    params.history,
    params.workspaceTimeZone
  );
  if (!manualDate) {
    return automatedMax;
  }

  const manualSatisfied = computeLatestApplicableOccurrenceDate({
    dueDate: params.dueDate,
    rules: params.rules,
    evaluationDate: manualDate,
    recurringIntervalDays: params.recurringIntervalDays,
  });

  if (!manualSatisfied) {
    return automatedMax;
  }

  const maxAutomated = automatedMax;
  if (
    maxAutomated &&
    manualSatisfied <= maxAutomated &&
    manualDate <= maxAutomated
  ) {
    return automatedMax;
  }

  if (maxAutomated && manualSatisfied <= maxAutomated) {
    return automatedMax;
  }

  if (!maxAutomated || manualSatisfied > maxAutomated) {
    if (!automatedMax || manualSatisfied > automatedMax) {
      return manualSatisfied;
    }
  }

  return automatedMax;
}

/** Generic manual email (ruleId=null) sent today suppresses automated sends for the invoice. */
export function manualEmailSentTodayForInvoice(
  history: ReminderHistoryEntry[],
  evaluationDate: string,
  workspaceTimeZone: string | null | undefined
): boolean {
  for (const entry of history) {
    if (entry.ruleId !== null) continue;
    if (entry.status !== "sent") continue;
    if (!entry.sentAt) continue;

    const sentCalendarDate = instantToWorkspaceCalendarDate(
      entry.sentAt,
      workspaceTimeZone
    );
    if (sentCalendarDate === evaluationDate) {
      return true;
    }
  }

  return false;
}

function evaluateCollectibleGates(
  input: ReminderEligibilityInput,
  dueDate: string
): ReminderEligibilityResult | null {
  const { evaluationDate, rule, invoice } = input;

  if (!rule.isEnabled) {
    return ineligible("rule_disabled");
  }

  if (invoice.archivedAt) {
    return ineligible("invoice_archived");
  }

  if (invoice.clientArchivedAt) {
    return ineligible("client_archived");
  }

  if (invoice.clientIsActive !== true) {
    return ineligible("client_inactive");
  }

  if (!invoice.dueDate) {
    return ineligible("missing_due_date");
  }

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

  return null;
}

/**
 * Evaluates a specific scheduled occurrence (used for recurring chase on the final rule).
 */
export function evaluateScheduledOccurrenceEligibility(
  input: ReminderEligibilityInput & {
    scheduledDate: string;
    allRules?: AfterDueRuleRef[];
  }
): ReminderEligibilityResult {
  const { evaluationDate, rule, invoice, history, scheduledDate } = input;
  const workspaceTimeZone = input.workspaceTimeZone ?? "UTC";
  const dueDate = invoice.dueDate!.slice(0, 10);

  const gateResult = evaluateCollectibleGates(input, dueDate);
  if (gateResult) return gateResult;

  const daysFromDueDate = differenceCalendarDays(evaluationDate, dueDate);

  if (
    !isOccurrenceCatchUpEligible({
      evaluationDate,
      dueDate,
      scheduledDate,
      triggerType: rule.triggerType,
    })
  ) {
    return ineligible("trigger_not_due", {
      daysFromDueDate: daysFromDueDate ?? undefined,
      scheduledDate,
    });
  }

  if (
    isOccurrenceSatisfied({
      history,
      ruleId: rule.id,
      scheduledDate,
      rule,
      dueDate,
      workspaceTimeZone,
      allRules: input.allRules,
      successfulInvoiceDeliveryOnDueDate: input.successfulInvoiceDeliveryOnDueDate,
    })
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

/**
 * Determines whether an invoice is eligible for a specific reminder rule
 * on a workspace-local evaluation date.
 */
export function evaluateReminderEligibility(
  input: ReminderEligibilityInput & { allRules?: AfterDueRuleRef[] }
): ReminderEligibilityResult {
  const { evaluationDate, rule, invoice, history } = input;
  const workspaceTimeZone = input.workspaceTimeZone ?? "UTC";
  const dueDate = invoice.dueDate?.slice(0, 10);

  if (!dueDate) {
    const gate = evaluateCollectibleGates(input, "");
    return gate ?? ineligible("missing_due_date");
  }

  const gateResult = evaluateCollectibleGates(input, dueDate);
  if (gateResult) return gateResult;

  const scheduledDate = computeScheduledDateForRule(
    dueDate,
    rule.triggerType,
    rule.offsetDays
  );
  if (!scheduledDate) {
    return ineligible("unsupported_trigger_type");
  }

  const daysFromDueDate = differenceCalendarDays(evaluationDate, dueDate);

  if (
    !isOccurrenceCatchUpEligible({
      evaluationDate,
      dueDate,
      scheduledDate,
      triggerType: rule.triggerType,
    })
  ) {
    return ineligible("trigger_not_due", {
      daysFromDueDate: daysFromDueDate ?? undefined,
      scheduledDate,
    });
  }

  if (
    isOccurrenceSatisfied({
      history,
      ruleId: rule.id,
      scheduledDate,
      rule,
      dueDate,
      workspaceTimeZone,
      allRules: input.allRules,
      successfulInvoiceDeliveryOnDueDate: input.successfulInvoiceDeliveryOnDueDate,
    })
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

/** Whether an imported/old invoice should skip one-shot stages and enter recurring chase. */
export function shouldImportJumpToRecurring(params: {
  history: ReminderHistoryEntry[];
  finalOneShotDate: string | null;
  evaluationDate: string;
  dueDate: string;
  finalOffsetDays: number;
  recurringIntervalDays?: number;
}): boolean {
  const hasRuleBoundSentHistory = params.history.some(
    (entry) => entry.status === "sent" && entry.ruleId
  );
  if (hasRuleBoundSentHistory) return false;
  if (!params.finalOneShotDate) return false;
  if (params.evaluationDate <= params.finalOneShotDate) return false;

  const recurring = computeLatestRecurringOccurrence({
    dueDate: params.dueDate,
    finalOffsetDays: params.finalOffsetDays,
    intervalDays: params.recurringIntervalDays ?? RECURRING_OVERDUE_INTERVAL_DAYS,
    evaluationDate: params.evaluationDate,
  });

  return recurring !== null && recurring.k >= 1;
}

export { addCalendarDays };
