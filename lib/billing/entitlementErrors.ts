export type EntitlementErrorCode =
  | "TRIAL_EXPIRED"
  | "TRIAL_CLIENT_LIMIT_REACHED"
  | "TRIAL_INVOICE_LIMIT_REACHED"
  | "TRIAL_AI_LIMIT_REACHED"
  | "TRIAL_AUTOMATION_LIMIT_REACHED"
  | "TRIAL_MANUAL_EMAIL_LIMIT_REACHED"
  | "PLAN_LIMIT_CLIENTS"
  | "PLAN_LIMIT_INVOICES"
  | "PAID_PLAN_REQUIRED"
  | "DOWNGRADE_REQUIRES_SUPPORT";

export class EntitlementError extends Error {
  code: EntitlementErrorCode;

  constructor(code: EntitlementErrorCode, message: string) {
    super(message);
    this.name = "EntitlementError";
    this.code = code;
  }
}

export const TRIAL_EXPIRED_MESSAGE =
  "Your Arrexia trial has ended. Choose a paid plan to continue making changes.";

export const TRIAL_CLIENT_LIMIT_MESSAGE =
  "You have reached the trial client limit. Upgrade to add more clients.";

export const TRIAL_INVOICE_LIMIT_MESSAGE =
  "You have reached the trial invoice limit. Upgrade to create more invoices.";

export const TRIAL_AI_LIMIT_MESSAGE =
  "You have reached the trial AI generation limit. Upgrade to continue using Arrexia AI.";

export const TRIAL_AUTOMATED_REMINDER_LIMIT_MESSAGE =
  "You have reached the trial automated reminder limit. Upgrade to continue automation.";

export const TRIAL_MANUAL_EMAIL_REMINDER_LIMIT_MESSAGE =
  "You have reached the trial manual email reminder limit. Upgrade to send more reminders.";
