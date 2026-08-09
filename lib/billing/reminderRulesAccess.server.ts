import "server-only";

import { getWorkspaceEntitlementState } from "@/lib/billing/getWorkspaceEntitlement";
import type { WorkspacePlan } from "@/lib/billing/plans";
import {
  canManageReminderRulesForEntitlement,
  REMINDER_RULES_PAID_PLAN_MESSAGE,
  REMINDER_RULES_TRIAL_EXPIRED_MESSAGE,
} from "@/lib/billing/reminderRulesAccess";

export async function getReminderRulesPlanAccess(workspaceId: string): Promise<{
  plan: WorkspacePlan;
  canManage: boolean;
}> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  return {
    plan: entitlement.paidPlan ?? entitlement.plan,
    canManage: canManageReminderRulesForEntitlement(entitlement),
  };
}

export async function assertReminderRulesManageAllowed(
  workspaceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state === "trial_expired" || !entitlement.canMutate) {
    return { ok: false, error: REMINDER_RULES_TRIAL_EXPIRED_MESSAGE };
  }
  if (!canManageReminderRulesForEntitlement(entitlement)) {
    return { ok: false, error: REMINDER_RULES_PAID_PLAN_MESSAGE };
  }
  return { ok: true };
}
