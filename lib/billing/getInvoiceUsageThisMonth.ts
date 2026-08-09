import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceEntitlementState } from "./getWorkspaceEntitlement";
import { getRemainingTrialUsage, loadEntitlementUsage } from "./usageMetering";

function getMonthBoundariesUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  return { start: start.toISOString(), end: nextMonth.toISOString() };
}

export async function getInvoiceUsageThisMonth(workspaceId: string) {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial") {
    const usage = await loadEntitlementUsage(workspaceId);
    const limit = entitlement.trialInvoiceLimitTotal;
    return {
      used: usage.trial_invoices_created,
      limit,
      overLimit: limit !== null ? usage.trial_invoices_created >= limit : false,
    };
  }

  const supabase = supabaseAdmin();
  const { start, end } = getMonthBoundariesUtc();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, issue_date, created_at")
    .eq("workspace_id", workspaceId)
    .or(
      `and(issue_date.gte.${start},issue_date.lt.${end}),and(issue_date.is.null,created_at.gte.${start},created_at.lt.${end})`
    );

  if (error) {
    throw new Error(`Failed to count invoices: ${error.message}`);
  }

  const used = data?.length ?? 0;
  const limit = entitlement.invoiceLimitMonthly ?? null;

  return {
    used,
    limit,
    overLimit: limit !== null ? used > limit : false,
  };
}

export async function getTrialInvoiceUsageTotal(workspaceId: string) {
  const usage = await loadEntitlementUsage(workspaceId);
  return {
    used: usage.trial_invoices_created,
    remaining: getRemainingTrialUsage(usage, "trial_invoices"),
  };
}
