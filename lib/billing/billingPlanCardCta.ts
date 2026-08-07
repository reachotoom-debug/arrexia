import {
  getWorkspacePlanRank,
  type PlanId,
  type WorkspacePlan,
} from "./plans";

const DOWNGRADE_MESSAGE =
  "Downgrades are managed by support and cannot be applied immediately.";

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

export function getBillingPlanCardCta(
  currentEffectivePlan: WorkspacePlan,
  targetPlanId: SelfServiceBillingPlanId
): BillingPlanCardCta {
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
      label: "Downgrade unavailable",
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
