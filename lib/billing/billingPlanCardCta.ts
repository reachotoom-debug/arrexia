import {
  getWorkspacePlanRank,
  type PlanId,
  type WorkspacePlan,
} from "./plans";
import type { EntitlementState } from "./resolveWorkspaceEntitlement";

const DOWNGRADE_MESSAGE =
  "Lower-tier plan changes are managed by support.";

export const BILLING_CONTACT_SALES_PATH = "/contact";

const SELF_SERVICE_BILLING_PLANS = ["starter", "pro", "business"] as const;
export type SelfServiceBillingPlanId = (typeof SELF_SERVICE_BILLING_PLANS)[number];

export function isSelfServiceBillingPlan(planId: PlanId): planId is SelfServiceBillingPlanId {
  return SELF_SERVICE_BILLING_PLANS.includes(planId as SelfServiceBillingPlanId);
}

export type BillingPlanCardCta = {
  label: string;
  disabled: boolean;
  canSubmit: boolean;
  href?: string;
  disabledReason?: string;
};

export type BillingEntitlementContext = {
  entitlementState: EntitlementState;
  paidPlan: WorkspacePlan | null;
};

function contactSalesCta(label: string, disabledReason?: string): BillingPlanCardCta {
  return {
    label,
    disabled: false,
    canSubmit: false,
    href: BILLING_CONTACT_SALES_PATH,
    disabledReason,
  };
}

export function getBillingPlanCardCta(
  context: BillingEntitlementContext | WorkspacePlan,
  targetPlanId: SelfServiceBillingPlanId
): BillingPlanCardCta {
  if (typeof context === "string" && context === "free") {
    const currentRank = getWorkspacePlanRank("free");
    const targetRank = getWorkspacePlanRank(targetPlanId);
    if (targetRank < currentRank) {
      return {
        label: "Contact Sales",
        disabled: true,
        canSubmit: false,
        disabledReason: DOWNGRADE_MESSAGE,
      };
    }
    return contactSalesCta("Request Upgrade");
  }

  const entitlementContext: BillingEntitlementContext =
    typeof context === "string"
      ? { entitlementState: "paid", paidPlan: context }
      : context;

  const currentEffectivePlan =
    entitlementContext.paidPlan ??
    (entitlementContext.entitlementState === "legacy_free" ? "free" : "free");
  const currentRank = getWorkspacePlanRank(currentEffectivePlan);
  const targetRank = getWorkspacePlanRank(targetPlanId);

  if (
    entitlementContext.entitlementState === "paid" &&
    currentEffectivePlan === targetPlanId
  ) {
    return {
      label: "Current plan",
      disabled: true,
      canSubmit: false,
    };
  }

  if (targetRank < currentRank) {
    return {
      label: "Contact Sales",
      disabled: true,
      canSubmit: false,
      disabledReason: DOWNGRADE_MESSAGE,
    };
  }

  if (
    entitlementContext.entitlementState === "trial" ||
    entitlementContext.entitlementState === "trial_expired" ||
    entitlementContext.entitlementState === "legacy_free"
  ) {
    return contactSalesCta("Request Upgrade");
  }

  const planName = targetPlanId.charAt(0).toUpperCase() + targetPlanId.slice(1);
  return contactSalesCta(`Contact Sales`, `Upgrade to ${planName} requires Arrexia billing support.`);
}

export { DOWNGRADE_MESSAGE as BILLING_DOWNGRADE_MESSAGE };
