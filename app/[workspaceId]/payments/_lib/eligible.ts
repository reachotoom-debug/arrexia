import { supabaseServer } from "@/lib/supabase/server";

/**
 * Type for eligible client data used in payment forms
 */
export type PaymentEligibleClient = {
  client_id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  is_active: boolean;
  archived_at: string | null;
  open_invoices_count: number;
  total_outstanding: number;
};

/**
 * Get unique clients who have at least one eligible payable invoice
 * 
 * Computes eligible clients directly from invoices_view and clients table.
 * A client is eligible if:
 * - They are not archived (archived_at IS NULL)
 * - They have at least one invoice where:
 *   - outstanding > 0
 *   - display_status IN ('sent', 'overdue', 'partially_paid')
 *   - The invoice is not archived (invoices_view excludes archived invoices)
 * 
 * @param workspaceId - Workspace ID
 * @returns Array of eligible clients with aggregated invoice counts and totals
 */
export async function getEligibleClientsForPayments(
  workspaceId: string
): Promise<PaymentEligibleClient[]> {
  const supabase = await supabaseServer();

  // 1) Pull all open invoices from invoices_view
  // Note: invoices_view already excludes archived invoices
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices_view")
    .select("client_id, outstanding, display_status")
    .eq("workspace_id", workspaceId)
    .gt("outstanding", 0)
    .in("display_status", ["sent", "overdue", "partially_paid"]);

  if (invoicesError) {
    console.error("[getEligibleClientsForPayments] invoices_view error", {
      workspaceId,
      error: invoicesError,
    });
    throw new Error("Failed to load eligible clients for payments");
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  // 2) Extract unique client IDs
  const clientIds = Array.from(
    new Set(
      invoices
        .map((inv) => inv.client_id)
        .filter((id): id is string => id !== null && id !== undefined)
    )
  );

  if (clientIds.length === 0) {
    return [];
  }

  // 3) Load client details from clients table
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, workspace_id, name, email, whatsapp, is_active, archived_at")
    .eq("workspace_id", workspaceId)
    .in("id", clientIds)
    .is("archived_at", null) // Only non-archived clients
    .eq("is_active", true); // Only active clients

  if (clientsError) {
    console.error("[getEligibleClientsForPayments] clients error", {
      workspaceId,
      error: clientsError,
    });
    throw new Error("Failed to load eligible clients for payments");
  }

  if (!clients || clients.length === 0) {
    return [];
  }

  // 4) Aggregate invoice data per client in TypeScript
  const byClient = new Map<string, PaymentEligibleClient>();

  // Create a map of client IDs for quick lookup
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  for (const inv of invoices) {
    if (!inv.client_id) continue;

    const client = clientMap.get(inv.client_id);
    if (!client) continue; // Skip if client not in our filtered list (shouldn't happen)

    const outstanding = Number(inv.outstanding ?? 0);
    if (outstanding <= 0) continue;

    const key = inv.client_id;
    const existing = byClient.get(key);

    if (!existing) {
      byClient.set(key, {
        client_id: client.id,
        workspace_id: client.workspace_id,
        name: client.name,
        email: client.email ?? null,
        whatsapp: client.whatsapp ?? null,
        is_active: client.is_active ?? true,
        archived_at: client.archived_at ?? null,
        open_invoices_count: 1,
        total_outstanding: outstanding,
      });
    } else {
      existing.open_invoices_count += 1;
      existing.total_outstanding += outstanding;
    }
  }

  // 5) Filter and return only clients with open invoices
  return Array.from(byClient.values()).filter(
    (c) => c.open_invoices_count > 0 && c.total_outstanding > 0
  );
}

/**
 * Get eligible invoices for a specific client
 * 
 * Eligible invoice criteria:
 * - invoices.archived_at IS NULL
 * - invoices.status != 'void' (and ideally not 'draft')
 * - outstanding > 0 (from invoices_view.outstanding)
 * - client_id matches
 * - workspace_id matches
 * 
 * If includeInvoiceId is provided and not eligible, fetch it separately and prepend with forcedInclude flag
 * 
 * @param workspaceId - Workspace ID
 * @param clientId - Client ID
 * @param includeInvoiceId - Optional invoice ID to include even if not eligible (for edit mode)
 * @returns Array of eligible invoices compatible with PaymentForm Invoice interface
 */
export async function getEligibleInvoicesForClient(
  workspaceId: string,
  clientId: string,
  includeInvoiceId?: string | null
): Promise<Array<{
  id: string;
  client_id: string | null;
  invoice_number: string;
  status: string | null;
  outstanding_amount: number; // Legacy field name - maps from invoices_view.outstanding
  currency?: string;
}>> {
  const supabase = await supabaseServer();

  // Query invoices_view for eligible invoices
  const { data: eligibleInvoices, error } = await supabase
    .from("invoices_view")
    .select("id, invoice_number, outstanding, currency, display_status, client_id")
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId)
    // Explicit filter (even if invoices_view excludes archived invoices at SQL layer)
    .is("archived_at", null)
    .neq("base_status", "void")
    .neq("base_status", "draft")
    .gt("outstanding", 0)
    .in("display_status", ["sent", "overdue", "partially_paid"]);

  if (error) {
    console.error("[getEligibleInvoicesForClient] failed to load eligible invoices:", error);
    return [];
  }

  const invoices = (eligibleInvoices ?? []).map((inv) => ({
    id: inv.id,
    client_id: inv.client_id ?? null,
    invoice_number: inv.invoice_number ?? "",
    status: inv.display_status ?? "sent",
    outstanding_amount: Number(inv.outstanding ?? 0),
    currency: inv.currency || "USD",
  }));

  // If includeInvoiceId is provided and not in eligible list, fetch it separately
  if (includeInvoiceId && !invoices.some((inv) => inv.id === includeInvoiceId)) {
    const { data: includedInvoice } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, outstanding, currency, display_status, client_id")
      .eq("id", includeInvoiceId)
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (includedInvoice) {
      // Prepend with forcedInclude flag (for display purposes, but format matches PaymentForm)
      invoices.unshift({
        id: includedInvoice.id,
        client_id: includedInvoice.client_id ?? null,
        invoice_number: includedInvoice.invoice_number ?? "",
        status: includedInvoice.display_status ?? "sent",
        outstanding_amount: Number(includedInvoice.outstanding ?? 0),
        currency: includedInvoice.currency || "USD",
      });
    }
  }

  return invoices;
}
