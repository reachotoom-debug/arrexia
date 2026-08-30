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



export type BillingPlanCardCtaAction = "checkout" | "contact" | "none";



export type BillingPlanCardCta = {

  label: string;

  disabled: boolean;

  canSubmit: boolean;

  action: BillingPlanCardCtaAction;

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

    action: "contact",

    href: BILLING_CONTACT_SALES_PATH,

    disabledReason,

  };

}



function checkoutCta(label: string): BillingPlanCardCta {

  return {

    label,

    disabled: false,

    canSubmit: true,

    action: "checkout",

  };

}



function disabledCta(label: string, disabledReason?: string): BillingPlanCardCta {

  return {

    label,

    disabled: true,

    canSubmit: false,

    action: "none",

    disabledReason,

  };

}



function upgradeLabel(targetPlanId: SelfServiceBillingPlanId, subscribe: boolean): string {

  const planName = targetPlanId.charAt(0).toUpperCase() + targetPlanId.slice(1);

  return subscribe ? `Subscribe to ${planName}` : `Upgrade to ${planName}`;

}



export function getBillingPlanCardCta(

  context: BillingEntitlementContext | WorkspacePlan,

  targetPlanId: SelfServiceBillingPlanId

): BillingPlanCardCta {

  if (typeof context === "string" && context === "free") {

    const currentRank = getWorkspacePlanRank("free");

    const targetRank = getWorkspacePlanRank(targetPlanId);

    if (targetRank < currentRank) {

      return disabledCta("Contact Sales", DOWNGRADE_MESSAGE);

    }

    return checkoutCta(upgradeLabel(targetPlanId, true));

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

    return disabledCta("Current plan");

  }



  if (targetRank < currentRank) {

    return disabledCta("Contact Sales", DOWNGRADE_MESSAGE);

  }



  if (targetRank > currentRank) {

    const subscribe =

      entitlementContext.entitlementState === "trial" ||

      entitlementContext.entitlementState === "trial_expired" ||

      entitlementContext.entitlementState === "legacy_free";

    return checkoutCta(upgradeLabel(targetPlanId, subscribe));

  }



  return contactSalesCta("Contact Sales");

}



export { DOWNGRADE_MESSAGE as BILLING_DOWNGRADE_MESSAGE };


