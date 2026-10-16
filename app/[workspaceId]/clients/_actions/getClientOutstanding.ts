"use server";

import { readAllPages } from "@/lib/db/readAllPages";
import { sumClientCurrencyAmounts } from "@/lib/clients/currencyPresentation";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";

type OutstandingResult = { ok: true; outstanding: number; hasOutstanding: boolean; outstandingByCurrency: Record<string, number> } | { ok: false; error: string };

/**
 * Get positive issued invoice balances per currency (excluding draft and void).
 * A failed or incomplete scan returns an error rather than allowing the action.
 * Note: Does not filter by archived_at - outstanding calculation doesn't need it
 */
export async function getClientOutstanding(
  workspaceId: string,
  clientId: string
): Promise<OutstandingResult> {
  try {
    await requireWorkspace(workspaceId);
    const supabase = await supabaseServer();

    console.log("[getClientOutstanding] computing outstanding", { workspaceId, clientId });

    // Fetch invoices for this client with outstanding amounts
    // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
    // IMPORTANT: Do NOT filter by archived_at - outstanding calculation doesn't need it
    // and archived_at may not exist in all contexts/views
    const { data: invoices } = await readAllPages<{outstanding: number | null; currency: string | null}>((from, to) => supabase
      .from("invoices_view")
      .select("outstanding, display_status, currency")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .neq("display_status", "void")
      .neq("display_status", "draft")
      .order("id", { ascending: true }).range(from, to));

    const positiveInvoices = invoices.filter((invoice) => Number(invoice.outstanding ?? 0) > 0);
    const outstandingByCurrency = sumClientCurrencyAmounts(positiveInvoices, (invoice) => Number(invoice.outstanding ?? 0));
    const amounts = Object.values(outstandingByCurrency);
    // Compatibility scalar is meaningful only when one currency is present.
    const outstanding = amounts.length === 1 ? amounts[0] : 0;
    const hasOutstanding = positiveInvoices.length > 0;

    console.log("[getClientOutstanding] computed outstanding", { workspaceId, clientId, outstanding });

    return { ok: true, outstanding, outstandingByCurrency, hasOutstanding };
  } catch (e) {
    const errorMsg = e && typeof e === "object" && "message" in e && typeof e.message === "string"
      ? e.message
      : "Unknown error";
    console.error("[getClientOutstanding] exception", {
      error: errorMsg,
      workspaceId,
      clientId,
      exception: e,
    });
    return {
      ok: false,
      error: errorMsg,
    };
  }
}
