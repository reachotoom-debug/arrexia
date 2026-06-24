import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase/index";

/**
 * Helper function to get invoice_items for a workspace.
 * 
 * NOTE: invoice_items has no workspace_id; scope via invoices join.
 * This function ensures proper workspace scoping by:
 * 1. First fetching invoice IDs for the workspace
 * 2. Then fetching invoice_items where invoice_id IN (...)
 * 
 * This avoids N+1 queries and ensures correct workspace isolation.
 */
export async function getInvoiceItemsForWorkspace(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  invoiceIds?: string[]
): Promise<{
  items: Array<{
    id: string;
    invoice_id: string;
    name: string | null;
    description: string | null;
    quantity: number;
    unit_price: number;
    position: number | null;
    created_at: string | null;
  }>;
  error: Error | null;
}> {
  try {
    // If invoiceIds not provided, fetch them first
    let validInvoiceIds: string[] = [];
    
    if (!invoiceIds || invoiceIds.length === 0) {
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null);

      if (invoicesError) {
        return { items: [], error: invoicesError };
      }

      validInvoiceIds = (invoices || []).map((inv) => inv.id);
    } else {
      // Validate that all provided invoiceIds belong to the workspace
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", invoiceIds);

      if (invoicesError) {
        return { items: [], error: invoicesError };
      }

      validInvoiceIds = (invoices || []).map((inv) => inv.id);
    }

    // If no valid invoices, return empty array
    if (validInvoiceIds.length === 0) {
      return { items: [], error: null };
    }

    // Fetch invoice_items for valid invoice IDs
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, name, description, quantity, unit_price, position, created_at")
      .in("invoice_id", validInvoiceIds)
      .order("position", { ascending: true, nullsFirst: false });

    if (itemsError) {
      return { items: [], error: itemsError };
    }

    return {
      items: (items || []).map((item) => ({
        id: item.id,
        invoice_id: item.invoice_id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        position: item.position,
        created_at: item.created_at,
      })),
      error: null,
    };
  } catch (error) {
    return {
      items: [],
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}

