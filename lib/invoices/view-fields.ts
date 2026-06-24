/**
 * Canonical invoice select fields from invoices_view
 * 
 * Use this helper to ensure consistent field selection when querying invoices_view.
 * Never query outstanding_amount from invoices table - use invoices_view.outstanding instead.
 * 
 * Example usage:
 * ```ts
 * const { data } = await supabase
 *   .from("invoices_view")
 *   .select(getInvoiceViewFields(["id", "invoice_number", "outstanding", "display_status"]))
 *   .eq("workspace_id", workspaceId);
 * ```
 */

export type InvoiceViewField =
  | "id"
  | "workspace_id"
  | "client_id"
  | "invoice_number"
  | "issue_date"
  | "due_date"
  | "base_status"
  | "display_status"
  | "total"
  | "paid"
  | "outstanding"
  | "currency"
  | "client_name"
  | "overdue_days"
  | "po_number"
  | "notes";

/**
 * Get canonical invoice fields from invoices_view
 * 
 * @param fields - Array of field names to select
 * @returns Comma-separated string of fields for Supabase select
 */
export function getInvoiceViewFields(fields: InvoiceViewField[]): string {
  return fields.join(", ");
}

/**
 * Common field sets for different use cases
 */
export const InvoiceViewFieldSets = {
  /** Basic invoice info (id, number, status) */
  basic: ["id", "invoice_number", "display_status"] as InvoiceViewField[],
  
  /** Invoice with financial data (for payment forms, lists) */
  financial: [
    "id",
    "invoice_number",
    "client_id",
    "outstanding",
    "paid",
    "total",
    "currency",
    "display_status",
  ] as InvoiceViewField[],
  
  /** Full invoice details (for detail pages) */
  full: [
    "id",
    "workspace_id",
    "client_id",
    "invoice_number",
    "issue_date",
    "due_date",
    "base_status",
    "display_status",
    "total",
    "paid",
    "outstanding",
    "currency",
    "client_name",
    "overdue_days",
    "po_number",
    "notes",
  ] as InvoiceViewField[],
  
  /** Invoice with client info (for lists with client names) */
  withClient: [
    "id",
    "invoice_number",
    "client_id",
    "client_name",
    "outstanding",
    "total",
    "currency",
    "display_status",
    "due_date",
  ] as InvoiceViewField[],
} as const;

/**
 * Type for invoice row from invoices_view
 * Use this type when working with data from invoices_view
 */
export type InvoiceViewRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  base_status: "draft" | "sent" | "void";
  display_status: "draft" | "sent" | "paid" | "overdue" | "partially_paid" | "void";
  total: number;
  paid: number;
  outstanding: number; // ✅ Canonical field - never use outstanding_amount
  currency: string;
  client_name: string | null;
  overdue_days: number;
  po_number: string | null;
  notes: string | null;
};

/**
 * Helper to map invoice_view row to legacy format (for backward compatibility)
 * Use only when necessary for existing UI components that expect outstanding_amount
 * 
 * @deprecated Prefer using outstanding directly from invoices_view
 */
export function mapInvoiceViewToLegacyFormat<T extends { outstanding: number }>(
  invoice: T
): T & { outstanding_amount: number } {
  return {
    ...invoice,
    outstanding_amount: Number(invoice.outstanding ?? 0),
  };
}
