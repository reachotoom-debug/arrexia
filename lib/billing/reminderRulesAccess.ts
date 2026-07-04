import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import type { WorkspacePlan } from "@/lib/billing/plans";

export const REMINDER_RULES_PAID_PLAN_MESSAGE =
  "Reminder automation rules are available on paid plans.";

export function canManageReminderRules(plan: WorkspacePlan): boolean {
  return plan !== "free";
}

export async function getReminderRulesPlanAccess(workspaceId: string): Promise<{
  plan: WorkspacePlan;
  canManage: boolean;
}> {
  const { plan } = await getWorkspacePlan(workspaceId);
  return {
    plan,
    canManage: canManageReminderRules(plan),
  };
}

export async function assertReminderRulesManageAllowed(
  workspaceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { canManage } = await getReminderRulesPlanAccess(workspaceId);
  if (!canManage) {
    return { ok: false, error: REMINDER_RULES_PAID_PLAN_MESSAGE };
  }
  return { ok: true };
}
