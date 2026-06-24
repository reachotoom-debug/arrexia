import { supabaseServer } from "@/lib/supabase/server";
import { INVOICE_VIEW_BASE_FIELDS } from "@/lib/db/invoicesView";
import { formatCurrency } from "@/lib/format/currency";

/**
 * Type for eligible invoice data used in payment forms
 * Includes stable dropdown shape {label, value, currency, outstanding}
 * plus all fields needed by PaymentForm
 */
export type EligibleInvoice = {
  label: string; // Display label: "INV-XXXX · $N outstanding"
  value: string; // Invoice ID for form value
  currency: string;
  outstanding: number;
  // Additional fields for PaymentForm compatibility
  id: string;
  client_id: string | null;
  invoice_number: string;
  status: string | null;
  outstanding_amount: number; // Legacy field name - maps from invoices_view.outstanding
};

/**
 * Query invoices_view (single source of truth) to get invoices eligible for payment recording.
 * 
 * Filters:
 * - workspace_id = workspaceId
 * - base_status = 'sent' (excludes draft and void)
 * - outstanding > 0.01
 * - display_status IN ('sent','overdue','partially_paid')
 * - client_id = clientId (if provided)
 * 
 * Sort: due_date asc, then invoice_number asc
 * 
 * @param includeInvoiceId - If provided and invoice is not in eligible list, fetch it separately and append with special label
 * 
 * Returns: { invoices: EligibleInvoice[], error?: string }
 * Never silently returns empty list on error - always includes error message.
 */
export async function getEligibleInvoices(
  workspaceId: string,
  clientId?: string,
  includeInvoiceId?: string
): Promise<{ invoices: EligibleInvoice[]; error?: string }> {
  const supabase = await supabaseServer();

  // Build query from invoices_view (single source of truth)
  // Rules: Only invoices where base_status NOT IN ('draft','void') AND outstanding > 0
  // Never depend on frontend-computed balances - use view columns only
  let query = supabase
    .from("invoices_view")
    .select(`${INVOICE_VIEW_BASE_FIELDS}, client_name, base_status`)
    .eq("workspace_id", workspaceId)
    .neq("base_status", "draft") // Exclude draft
    .neq("base_status", "void") // Exclude void
    .gt("outstanding", 0); // Outstanding > 0

  // Optional: Filter by client if provided (handle clientId = null safely)
  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  // Sort by due_date ascending, then invoice_number ascending
  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("invoice_number", { ascending: true });

  const { data, error } = await query;

  if (error) {
    // Full error logging (message, code, details)
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
    };
    console.error("[getEligibleInvoices] query failed", {
      code: errorDetails.code,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
      queryInputs: {
        workspaceId,
        clientId: clientId || null,
        table: "invoices_view",
      },
    });
    
    // Return empty array ONLY if no rows, not on error
    // Return error so caller knows something went wrong
    return { 
      invoices: [], 
      error: `Could not load invoices: ${errorDetails.message}` 
    };
  }

  if (!data) {
    // This is a data issue, not an error, so return empty list without error
    // Return empty array ONLY if no rows (no error)
    console.warn("[getEligibleInvoices] query returned no data", {
      workspaceId,
      clientId: clientId || null,
    });
    return { invoices: [] };
  }

  // Map to stable dropdown shape with all PaymentForm fields
  // Currency is now available directly from invoices_view
  const eligible = data
    .map((inv) => {
      const invoiceNumber = inv.invoice_number ?? "";
      const outstanding = Number(inv.outstanding ?? 0);
      const currency = inv.currency || "USD"; // Get from invoices_view, fallback to USD
      
      // Format label: "INV-XXXX · $N outstanding" (invoice number + outstanding + currency)
      const formattedOutstanding = formatCurrency(outstanding, { currency });
      
      return {
        // Stable dropdown shape: invoice number + outstanding + currency
        label: `${invoiceNumber} · ${formattedOutstanding} outstanding`,
        value: inv.id,
        currency,
        outstanding,
        // PaymentForm compatibility fields
        id: inv.id,
        client_id: inv.client_id ?? null,
        invoice_number: invoiceNumber,
        status: inv.display_status ?? "sent", // Use display_status from view
        outstanding_amount: outstanding,
      };
    });

  // If includeInvoiceId is provided and not in eligible list, fetch it separately
  // Invoice dropdown MUST show the linked invoice - do not re-filter it out by outstanding > 0
  // This is critical for Edit Payment page where invoice might be fully paid now
  if (includeInvoiceId && !eligible.some((inv) => inv.id === includeInvoiceId)) {
    console.log("[getEligibleInvoices] fetching includeInvoiceId (not in eligible list)", {
      invoiceId: includeInvoiceId,
      workspaceId,
      clientId: clientId || null,
    });

    // Fetch from invoices_view WITHOUT eligibility filters
    // This ensures the linked invoice always appears in dropdown for edit payment
    // Select: id, invoice_number, client_id, client_name, due_date, outstanding, total, currency, display_status
    const { data: includedInvoice, error: includedError } = await supabase
      .from("invoices_view")
      .select("id, client_id, client_name, invoice_number, due_date, outstanding, total, currency, display_status, base_status")
      .eq("id", includeInvoiceId)
      .eq("workspace_id", workspaceId)
      .single();

    if (includedError || !includedInvoice) {
      console.warn("[getEligibleInvoices] failed to fetch includeInvoiceId from invoices_view", {
        invoiceId: includeInvoiceId,
        invoicesViewError: {
          message: includedError?.message,
          code: includedError?.code,
          details: includedError?.details,
          hint: includedError?.hint,
        },
      });
    } else {
      // Successfully fetched from invoices_view (currency included)
      // Format label: invoice number + outstanding + currency
      const invoiceNumber = includedInvoice.invoice_number ?? "Unknown";
      const outstanding = Number(includedInvoice.outstanding ?? 0);
      const currency = includedInvoice.currency || "USD";
      const isFullyPaid = outstanding <= 0.01;
      
      const formattedOutstanding = formatCurrency(outstanding, { currency });

      eligible.push({
        label: isFullyPaid 
          ? `${invoiceNumber} (already paid) · ${formattedOutstanding}`
          : `${invoiceNumber} (not eligible) · ${formattedOutstanding}`,
        value: includedInvoice.id,
        currency,
        outstanding,
        id: includedInvoice.id,
        client_id: includedInvoice.client_id,
        invoice_number: invoiceNumber,
        status: includedInvoice.display_status ?? "sent", // Use display_status from view
        outstanding_amount: outstanding,
      });
    }
  }

  return { invoices: eligible };
}

