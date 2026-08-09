import {
  getWorkspacePlanRank,
  type PlanId,
  type WorkspacePlan,
} from "./plans";
import type { EntitlementState } from "./resolveWorkspaceEntitlement";

const DOWNGRADE_MESSAGE =
  "Lower-tier plan changes are managed by support.";

const SELF_SERVICE_BILLING_PLANS = ["starter", "pro", "business"] as const;
export type SelfServiceBillingPlanId = (typeof SELF_SERVICE_BILLING_PLANS)[number];

export function isSelfServiceBillingPlan(planId: PlanId): planId is SelfServiceBillingPlanId {
  return SELF_SERVICE_BILLING_PLANS.includes(planId as SelfServiceBillingPlanId);
}

export type BillingPlanCardCta = {
  label: string;
  disabled: boolean;
  canSubmit: boolean;
  disabledReason?: string;
};

export type BillingEntitlementContext = {
  entitlementState: EntitlementState;
  paidPlan: WorkspacePlan | null;
};

export function getBillingPlanCardCta(
  context: BillingEntitlementContext | WorkspacePlan,
  targetPlanId: SelfServiceBillingPlanId
): BillingPlanCardCta {
  const entitlementContext: BillingEntitlementContext =
    typeof context === "string"
      ? { entitlementState: "paid", paidPlan: context === "free" ? null : context }
      : context;

  if (
    entitlementContext.entitlementState === "trial" ||
    entitlementContext.entitlementState === "trial_expired"
  ) {
    const planName = targetPlanId.charAt(0).toUpperCase() + targetPlanId.slice(1);
    return {
      label: `Select ${planName}`,
      disabled: false,
      canSubmit: true,
    };
  }

  const currentEffectivePlan =
    entitlementContext.paidPlan ??
    (entitlementContext.entitlementState === "paid" ? "free" : "free");
  const currentRank = getWorkspacePlanRank(currentEffectivePlan);
  const targetRank = getWorkspacePlanRank(targetPlanId);

  if (currentEffectivePlan === targetPlanId) {
    return {
      label: "Current plan",
      disabled: true,
      canSubmit: false,
    };
  }

  if (targetRank < currentRank) {
    return {
      label: "Select plan",
      disabled: true,
      canSubmit: false,
      disabledReason: DOWNGRADE_MESSAGE,
    };
  }

  const planName = targetPlanId.charAt(0).toUpperCase() + targetPlanId.slice(1);
  return {
    label: `Upgrade to ${planName}`,
    disabled: false,
    canSubmit: true,
  };
}

export { DOWNGRADE_MESSAGE as BILLING_DOWNGRADE_MESSAGE };
