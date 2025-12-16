/**
 * Invoice status types - canonical status values from invoices_view.display_status
 * These values are computed in SQL and should be the single source of truth.
 */
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

/**
 * Base status from invoices table (manual status set by user)
 */
export type InvoiceBaseStatus = "draft" | "sent" | "void";
