/**
 * Canonical invoice select fields from invoices_view
 * 
 * This is the ONLY source for financial fields: outstanding, paid, display_status
 * NEVER read these fields from the invoices table directly.
 */

export const INVOICE_VIEW_BASE_FIELDS = `
  id,
  workspace_id,
  client_id,
  invoice_number,
  issue_date,
  due_date,
  currency,
  total,
  paid,
  outstanding,
  display_status,
  archived_at
`;

/**
 * Additional fields available in invoices_view
 */
export const INVOICE_VIEW_EXTENDED_FIELDS = `
  base_status,
  client_name,
  overdue_days,
  po_number,
  notes
`;

/**
 * Full invoices_view fields (base + extended)
 */
export const INVOICE_VIEW_FULL_FIELDS = `
  ${INVOICE_VIEW_BASE_FIELDS},
  ${INVOICE_VIEW_EXTENDED_FIELDS}
`;

