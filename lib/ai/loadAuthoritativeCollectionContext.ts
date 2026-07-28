import "server-only";

import { loadCustomerFacingBusinessName } from "@/lib/branding/loadCustomerFacingBusinessName";
import { isInvoiceFullyPaid } from "@/lib/invoices/invoiceFinancialState";
import { isOperationalReceivableInvoice } from "@/lib/receivables/operationalEligibility";
import type { supabaseServer } from "@/lib/supabase/server";
import { buildCollectionMessageFacts } from "./buildCollectionMessageFacts";
import type { CollectionMessageFacts } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

export type LoadAuthoritativeCollectionContextResult =
  | { ok: true; facts: CollectionMessageFacts }
  | {
      ok: false;
      code: "not_found" | "forbidden" | "ineligible" | "paid";
    };

export async function loadAuthoritativeCollectionContext(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  invoiceId: string;
}): Promise<LoadAuthoritativeCollectionContextResult> {
  const { supabase, workspaceId, invoiceId } = params;

  const { data: invoice, error } = await supabase
    .from("invoices_view")
    .select(
      `
        id,
        workspace_id,
        client_name,
        invoice_number,
        outstanding,
        paid,
        total,
        currency,
        due_date,
        overdue_days,
        is_overdue,
        display_status,
        base_status,
        archived_at,
        client_is_active,
        client_archived_at
      `
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.error("[loadAuthoritativeCollectionContext] invoice load error", error);
    return { ok: false, code: "not_found" };
  }

  if (!invoice?.id || invoice.workspace_id !== workspaceId) {
    return { ok: false, code: "not_found" };
  }

  if (isInvoiceFullyPaid(invoice.outstanding)) {
    return { ok: false, code: "paid" };
  }

  if (
    !isOperationalReceivableInvoice({
      archivedAt: invoice.archived_at,
      baseStatus: invoice.base_status,
      outstanding: invoice.outstanding,
      clientIsActive: invoice.client_is_active,
      clientArchivedAt: invoice.client_archived_at,
    })
  ) {
    return { ok: false, code: "ineligible" };
  }

  const businessName = await loadCustomerFacingBusinessName(supabase, workspaceId);

  return {
    ok: true,
    facts: buildCollectionMessageFacts({ invoice, businessName }),
  };
}
