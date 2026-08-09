import "server-only";

import { getClientPlanUsage } from "./assertWithinPlanLimits";
import type { BillingUsageSummary } from "./billingUsageTypes";
import { buildBillingUsageMeters } from "./buildBillingUsageMeters";
import { getInvoiceUsageThisMonth } from "./getInvoiceUsageThisMonth";
import { getWorkspaceEntitlementState } from "./getWorkspaceEntitlement";
import { loadEntitlementUsage } from "./usageMetering";

export type { BillingUsageMeter, BillingUsageSummary } from "./billingUsageTypes";
export { buildBillingUsageMeters } from "./buildBillingUsageMeters";

export async function getBillingUsageSummary(
  workspaceId: string
): Promise<BillingUsageSummary> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  const [clientUsage, invoiceUsage] = await Promise.all([
    getClientPlanUsage(workspaceId),
    getInvoiceUsageThisMonth(workspaceId),
  ]);

  const entitlementUsage =
    entitlement.state === "trial" || entitlement.state === "trial_expired"
      ? await loadEntitlementUsage(workspaceId)
      : undefined;

  return {
    entitlementState: entitlement.state,
    meters: buildBillingUsageMeters({
      entitlementState: entitlement.state,
      clientUsage,
      invoiceUsage,
      entitlementUsage,
    }),
  };
}
