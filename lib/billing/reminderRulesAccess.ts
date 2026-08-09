import type { WorkspacePlan } from "@/lib/billing/plans";

export const REMINDER_RULES_PAID_PLAN_MESSAGE =
  "Reminder automation rules are available during your trial or on a paid plan.";

export const REMINDER_RULES_TRIAL_EXPIRED_MESSAGE =
  "Your trial has ended. Choose a paid plan to manage reminder rules.";

export function canManageReminderRulesForEntitlement(state: {
  state: string;
  canMutate: boolean;
}): boolean {
  return state.canMutate && (state.state === "trial" || state.state === "paid");
}

/** @deprecated Prefer canManageReminderRulesForEntitlement */
export function canManageReminderRules(plan: WorkspacePlan): boolean {
  return plan !== "free";
}
