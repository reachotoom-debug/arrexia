/**
 * Get eligible invoices for reminders
 * 
 * Filters invoices that are eligible for reminder sending based on:
 * - Invoice is not archived (archived_at IS NULL)
 * - Client is not archived (archived_at IS NULL) AND client is active (is_active = true)
 * - Invoice has outstanding balance (outstanding > 0)
 * - Invoice status is 'sent', 'partially_paid', or 'overdue' (display_status)
 * 
 * Excludes: draft, paid, void, or archived invoices
 */

import { supabaseServer } from "@/lib/supabase/server";

export type EligibleInvoiceForReminder = {
  invoice_id: string;
  invoice_number: string | null;
  due_date: string | null;
  outstanding: number;
  client_name: string | null;
  client_email: string | null;
};

/**
 * Get eligible invoices for reminders for a workspace
 * 
 * @param workspaceId - The workspace ID to query invoices for
 * @returns Array of eligible invoices with invoice_id, invoice_number, due_date, outstanding, client_name, client_email
 */
export async function getEligibleInvoicesForReminders(
  workspaceId: string
): Promise<EligibleInvoiceForReminder[]> {
  const supabase = await supabaseServer();

  // Step 1: Query invoices_view to get invoices with outstanding > 0 and eligible display_status
  // invoices_view already excludes archived invoices (WHERE archived_at IS NULL at SQL level)
  // However, we still need to filter by client status, so we'll do that in a second step
  const { data: candidateInvoices, error: invoicesError } = await supabase
    .from("invoices_view")
    .select(`
      id,
      client_id,
      invoice_number,
      due_date,
      outstanding,
      display_status
    `)
    .eq("workspace_id", workspaceId)
    // Reminders eligibility: only invoices with outstanding > 0 and not archived
    // This uses invoices_view as the single source of truth.
    .is("archived_at", null)
    .gt("outstanding", 0)
    .in("display_status", ["sent", "partially_paid", "overdue"]);

  if (invoicesError) {
    console.error("[getEligibleInvoicesForReminders] Error loading invoices:", {
      workspaceId,
      error: invoicesError,
    });
    return [];
  }

  if (!candidateInvoices || candidateInvoices.length === 0) {
    return [];
  }

  // Step 2: Get unique client IDs and load client status information
  const clientIds = [...new Set(candidateInvoices.map((inv) => inv.client_id).filter(Boolean))];
  
  if (clientIds.length === 0) {
    return [];
  }

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, email, archived_at, is_active")
    // Reminders eligibility: clients must be active AND not archived
    // This rule must match all reminders queries globally.
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .is("archived_at", null)
    .in("id", clientIds);

  if (clientsError) {
    console.error("[getEligibleInvoicesForReminders] Error loading clients:", {
      workspaceId,
      error: clientsError,
    });
    return [];
  }

  // Step 3: Build map of eligible clients
  // Client is eligible if: archived_at IS NULL AND is_active = true
  // This means: include only clients that are not archived AND active (matches Collections behavior)
  const eligibleClientMap = new Map<string, { name: string | null; email: string | null }>();
  
  for (const client of clients || []) {
    const isEligible = !client.archived_at && client.is_active === true;
    if (isEligible) {
      eligibleClientMap.set(client.id, {
        name: client.name || null,
        email: client.email || null,
      });
    }
  }

  // Step 4: Filter invoices to only those with eligible clients and map to return format
  const eligibleInvoices: EligibleInvoiceForReminder[] = [];

  for (const invoice of candidateInvoices) {
    // Skip if no client_id
    if (!invoice.client_id) {
      continue;
    }

    // Check if client is eligible
    const clientInfo = eligibleClientMap.get(invoice.client_id);
    if (!clientInfo) {
      // Client is archived and inactive, skip this invoice
      continue;
    }

    // Add to results
    eligibleInvoices.push({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number || null,
      due_date: invoice.due_date || null,
      outstanding: Number(invoice.outstanding || 0),
      client_name: clientInfo.name,
      client_email: clientInfo.email,
    });
  }

  return eligibleInvoices;
}

