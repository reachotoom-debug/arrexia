/**
 * Invoice list currency resolution for presentation (no FX conversion).
 */
export function resolveInvoiceDisplayCurrency(
  invoiceCurrency: string | null | undefined,
  workspaceDefaultCurrency: string | null | undefined
): string {
  return invoiceCurrency ?? workspaceDefaultCurrency ?? "USD";
}

/** Fields required on active-tab invoices_view select for list currency display. */
export const ACTIVE_INVOICES_VIEW_SELECT =
  "id, invoice_number, client_name, issue_date, due_date, total, paid, outstanding, display_status, risk_level, currency";
