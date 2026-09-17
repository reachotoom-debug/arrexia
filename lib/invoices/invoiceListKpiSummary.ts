import type { SupabaseClient } from "@supabase/supabase-js";
import { addKpiMoneyTotal, getKpiMoneyTotals, type KpiMoneyTotal } from "@/lib/format/kpiMoney";

export type InvoiceListKpiSummary = {
  totalInvoices: number;
  outstandingByCurrency: KpiMoneyTotal[];
  overdueInvoices: number;
};

/** Active workspace portfolio. Table filters and pagination never enter this loader. */
export async function loadInvoiceListKpiSummary(supabase: SupabaseClient, workspaceId: string): Promise<InvoiceListKpiSummary> {
  const pageSize = 1000;
  let totalInvoices = 0;
  let overdueInvoices = 0;
  const outstandingTotals = new Map<string | null, number>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("invoices_view")
      .select("base_status, outstanding, is_overdue, currency")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    totalInvoices += rows.length;
    for (const invoice of rows) {
      if (invoice.base_status === "draft" || invoice.base_status === "void") continue;
      // Financial balance and workspace-local overdue eligibility come from the canonical view.
      const outstanding = Number(invoice.outstanding ?? 0);
      addKpiMoneyTotal(outstandingTotals, outstanding, invoice.currency);
      if (invoice.is_overdue === true && outstanding > 0) overdueInvoices += 1;
    }
    if (rows.length < pageSize) break;
  }
  return { totalInvoices, outstandingByCurrency: getKpiMoneyTotals(outstandingTotals), overdueInvoices };
}
