import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspacePlan } from "./getWorkspacePlan";

function getMonthBoundariesUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  return { start: start.toISOString(), end: nextMonth.toISOString() };
}

export async function getInvoiceUsageThisMonth(workspaceId: string) {
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
  const plan = await getWorkspacePlan(workspaceId);
  const limit = plan.invoiceLimitMonthly ?? null;

  return {
    used,
    limit,
    overLimit: limit !== null ? used > limit : false,
  };
}
