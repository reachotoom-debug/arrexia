import { getCommercialSubscriptionPresentation } from "@/lib/billing/commercialSubscriptionPresentation";
import { getBillingUsageSummary } from "@/lib/billing/getBillingUsageSummary";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { resolvePaddleCheckoutCustomer } from "@/lib/billing/paddle/resolvePaddleCheckoutCustomer";
import { canManagePaddleSubscription } from "@/lib/billing/paddle/canManagePaddleSubscription";
import { loadWorkspaceSubscription } from "@/lib/billing/workspaceSubscription";
import { BillingPlansClient } from "./BillingPlansClient";

export async function BillingPlans({ workspaceId }: { workspaceId: string }) {
  const [current, usageSummary, workspaceSubscription, checkoutCustomer] = await Promise.all([
    getWorkspacePlan(workspaceId),
    getBillingUsageSummary(workspaceId),
    loadWorkspaceSubscription(workspaceId),
    resolvePaddleCheckoutCustomer(workspaceId),
  ]);

  const subscription = getCommercialSubscriptionPresentation({
    entitlementState: current.entitlement.state,
    paidPlan: current.entitlement.paidPlan,
    trial: current.trial,
  });

  const paddleCheckoutCustomer =
    checkoutCustomer.ok === true
      ? {
          available: true as const,
          customerId: checkoutCustomer.customerId ?? null,
          customerEmail: checkoutCustomer.customerEmail ?? null,
        }
      : {
          available: false as const,
          unavailableReason:
            checkoutCustomer.reason === "no_email"
              ? "Workspace owner email is required for billing."
              : checkoutCustomer.reason === "no_owner"
                ? "A workspace owner is required for billing."
                : "Billing contact lookup failed.",
        };

  const canManageSubscription = canManagePaddleSubscription({
    entitlementState: current.entitlement.state,
    paymentProvider: workspaceSubscription?.paymentProvider,
    providerCustomerId: workspaceSubscription?.providerCustomerId,
  });

  return (
    <BillingPlansClient
      workspaceId={workspaceId}
      paddleCheckoutCustomer={paddleCheckoutCustomer}
      canManageSubscription={canManageSubscription}
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
      paidCancelAtPeriodEnd={
        current.entitlement.state === "paid"
          ? (workspaceSubscription?.cancelAtPeriodEnd ?? false)
          : false
      }
      usageSummary={usageSummary}
    />
  );
}
