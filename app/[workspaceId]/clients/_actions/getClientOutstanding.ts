"use server";

import { supabaseServer } from "@/lib/supabase/server";

type OutstandingResult = { ok: true; outstanding: number } | { ok: false; error: string };

/**
 * Get outstanding balance for a client
 * Sum of invoice balances where balance > 0 and invoice not void
 * Note: Does not filter by archived_at - outstanding calculation doesn't need it
 */
export async function getClientOutstanding(
  workspaceId: string,
  clientId: string
): Promise<OutstandingResult> {
  try {
    const supabase = await supabaseServer();

    console.log("[getClientOutstanding] computing outstanding", { workspaceId, clientId });

    // Fetch invoices for this client with outstanding amounts
    // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
    // IMPORTANT: Do NOT filter by archived_at - outstanding calculation doesn't need it
    // and archived_at may not exist in all contexts/views
    const { data: invoices, error } = await supabase
      .from("invoices_view")
      .select("outstanding, display_status")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .neq("display_status", "void");

    if (error) {
      console.error("[getClientOutstanding] query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        workspaceId,
        clientId,
      });
      return { ok: false, error: error.message };
    }

    // Sum outstanding amounts where outstanding > 0
    const outstanding = (invoices || []).reduce((sum, inv) => {
      const amount = Number(inv.outstanding ?? 0);
      return sum + (amount > 0 ? amount : 0);
    }, 0);

    console.log("[getClientOutstanding] computed outstanding", { workspaceId, clientId, outstanding });

    return { ok: true, outstanding };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
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
