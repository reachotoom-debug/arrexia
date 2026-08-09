/** Central Arrexia standalone trial configuration. Change affects NEW trials only. */
export const TRIAL_DURATION_DAYS = 14;

export const TRIAL_CLIENT_LIMIT = 50;
export const TRIAL_INVOICE_LIMIT_TOTAL = 75;
export const TRIAL_MEMBER_LIMIT = 1;
export const TRIAL_AI_GENERATION_LIMIT = 50;
export const TRIAL_AUTOMATED_REMINDER_LIMIT = 75;
export const TRIAL_MANUAL_EMAIL_REMINDER_LIMIT = 75;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTrialDurationMs(days: number = TRIAL_DURATION_DAYS): number {
  return days * MS_PER_DAY;
}

export function computeTrialEndsAt(start: Date, days: number = TRIAL_DURATION_DAYS): string {
  return new Date(start.getTime() + computeTrialDurationMs(days)).toISOString();
}

export type TrialUsageResource =
  | "trial_invoices"
  | "ai_generations"
  | "automated_reminders"
  | "manual_email_reminders";

export const TRIAL_USAGE_LIMITS: Record<TrialUsageResource, number> = {
  trial_invoices: TRIAL_INVOICE_LIMIT_TOTAL,
  ai_generations: TRIAL_AI_GENERATION_LIMIT,
  automated_reminders: TRIAL_AUTOMATED_REMINDER_LIMIT,
  manual_email_reminders: TRIAL_MANUAL_EMAIL_REMINDER_LIMIT,
};
