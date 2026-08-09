import { getCommercialSubscriptionPresentation } from "@/lib/billing/commercialSubscriptionPresentation";
import { getBillingUsageSummary } from "@/lib/billing/getBillingUsageSummary";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { BillingPlansClient } from "./BillingPlansClient";

export async function BillingPlans({ workspaceId }: { workspaceId: string }) {
  const [current, usageSummary] = await Promise.all([
    getWorkspacePlan(workspaceId),
    getBillingUsageSummary(workspaceId),
  ]);

  const subscription = getCommercialSubscriptionPresentation({
    entitlementState: current.entitlement.state,
    paidPlan: current.entitlement.paidPlan,
    trial: current.trial,
  });

  return (
    <BillingPlansClient
      subscription={subscription}
      trial={current.trial}
      entitlementState={current.entitlement.state}
      paidPlan={current.entitlement.paidPlan}
      usageSummary={usageSummary}
    />
  );
}
