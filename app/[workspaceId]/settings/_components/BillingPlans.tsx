import { getCommercialSubscriptionPresentation } from "@/lib/billing/commercialSubscriptionPresentation";
import { getBillingUsageSummary } from "@/lib/billing/getBillingUsageSummary";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { loadWorkspaceSubscription } from "@/lib/billing/workspaceSubscription";
import { BillingPlansClient } from "./BillingPlansClient";

export async function BillingPlans({ workspaceId }: { workspaceId: string }) {
  const [current, usageSummary, workspaceSubscription] = await Promise.all([
    getWorkspacePlan(workspaceId),
    getBillingUsageSummary(workspaceId),
    loadWorkspaceSubscription(workspaceId),
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
      paidBillingInterval={
        current.entitlement.state === "paid"
          ? (workspaceSubscription?.billingInterval ?? "monthly")
          : null
      }
      paidPeriodEndsAt={
        current.entitlement.state === "paid"
          ? (workspaceSubscription?.currentPeriodEndsAt ?? null)
          : null
      }
      usageSummary={usageSummary}
    />
  );
}
