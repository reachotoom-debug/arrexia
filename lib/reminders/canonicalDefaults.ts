import type { WorkspacePlan } from "@/lib/billing/plans";

/** Stable template codes — unique per workspace via DB constraint (workspace_id, code). */
export const CANONICAL_TEMPLATE_CODES = [
  "pre_due",
  "due_day",
  "plus_3",
  "plus_7",
  "final",
] as const;

export type CanonicalTemplateCode = (typeof CANONICAL_TEMPLATE_CODES)[number];

export type CanonicalReminderStage = {
  code: CanonicalTemplateCode;
  ruleName: string;
  templateName: string;
  subject: string;
  body: string;
  triggerType: "before_due" | "on_due" | "after_due";
  offsetDays: number;
  sortOrder: number;
  forStatus: "sent";
};

/**
 * Canonical five-stage reminder sequence for Arrexia launch.
 * Copy aligned with lib/reminders/templates.ts (professional defaults).
 */
export const CANONICAL_REMINDER_STAGES: readonly CanonicalReminderStage[] = [
  {
    code: "pre_due",
    ruleName: "3 days before due",
    templateName: "Reminder: upcoming due date",
    subject: "Upcoming payment due for invoice {{invoice_number}}",
    body:
      "This is a friendly reminder that invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.",
    triggerType: "before_due",
    offsetDays: 3,
    sortOrder: 1,
    forStatus: "sent",
  },
  {
    code: "due_day",
    ruleName: "On due date",
    templateName: "Reminder: due today",
    subject: "Invoice {{invoice_number}} is due today",
    body:
      "Invoice {{invoice_number}} for {{amount_due}} is due today ({{due_date}}).",
    triggerType: "on_due",
    offsetDays: 0,
    sortOrder: 2,
    forStatus: "sent",
  },
  {
    code: "plus_3",
    ruleName: "3 days after due",
    templateName: "Reminder: 3 days overdue",
    subject: "Invoice {{invoice_number}} is 3 days overdue",
    body:
      "Invoice {{invoice_number}} for {{amount_due}} is now 3 days overdue (due {{due_date}}).\n\n" +
      "Please arrange payment at your earliest convenience.",
    triggerType: "after_due",
    offsetDays: 3,
    sortOrder: 3,
    forStatus: "sent",
  },
  {
    code: "plus_7",
    ruleName: "7 days after due",
    templateName: "Reminder: 7 days overdue",
    subject: "Invoice {{invoice_number}} is 7 days overdue",
    body:
      "Invoice {{invoice_number}} for {{amount_due}} is now 7 days overdue (due {{due_date}}).\n\n" +
      "We appreciate your prompt attention to this payment.",
    triggerType: "after_due",
    offsetDays: 7,
    sortOrder: 4,
    forStatus: "sent",
  },
  {
    code: "final",
    ruleName: "14 days after due",
    templateName: "Reminder: final notice",
    subject: "Final notice for invoice {{invoice_number}}",
    body:
      "This is a final reminder that invoice {{invoice_number}} for {{amount_due}} is still unpaid, " +
      "{{days_overdue}} days after the due date ({{due_date}}).\n\n" +
      "Please contact us if you have any questions.",
    triggerType: "after_due",
    offsetDays: 14,
    sortOrder: 5,
    forStatus: "sent",
  },
] as const;

const CANONICAL_CODE_SET = new Set<string>(CANONICAL_TEMPLATE_CODES);

export function isCanonicalTemplateCode(code: string): code is CanonicalTemplateCode {
  return CANONICAL_CODE_SET.has(code);
}

export function getCanonicalStageByCode(code: CanonicalTemplateCode): CanonicalReminderStage {
  const stage = CANONICAL_REMINDER_STAGES.find((s) => s.code === code);
  if (!stage) {
    throw new Error(`Unknown canonical template code: ${code}`);
  }
  return stage;
}

/** Starter / free trial: Automation Lite — three enabled stages. */
const STARTER_ENABLED_CODES = new Set<CanonicalTemplateCode>(["pre_due", "due_day", "plus_7"]);

/**
 * Default is_enabled for a newly provisioned canonical rule.
 * Free uses the same Automation Lite defaults as starter (legacy trial tier).
 * Applies only when creating a missing rule — existing rules are never updated.
 */
export function getDefaultEnabledForPlan(
  plan: WorkspacePlan,
  code: CanonicalTemplateCode
): boolean {
  if (plan === "pro") {
    return true;
  }
  return STARTER_ENABLED_CODES.has(code);
}

/** User-facing Applies To options — draft intentionally excluded from new rule UI. */
export const REMINDER_RULE_FOR_STATUS_UI_OPTIONS = [
  { value: "any", label: "Any status" },
  { value: "sent", label: "Sent only" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue only" },
] as const;

export const NO_REMINDER_TEMPLATES_MESSAGE =
  "No reminder templates are available yet.";
