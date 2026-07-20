/**
 * Verified production invoices_view column contract (ordinal order).
 * Keep in sync with supabase/migrations/20260721000000_align_invoices_view_client_status_contract.sql
 */

export type ViewColumnDefinition = {
  name: string;
  data_type: string;
};

/** 21 columns — matches verified production Supabase schema. */
export const INVOICES_VIEW_CONTRACT_COLUMNS: ViewColumnDefinition[] = [
  { name: "id", data_type: "uuid" },
  { name: "workspace_id", data_type: "uuid" },
  { name: "client_id", data_type: "uuid" },
  { name: "client_name", data_type: "text" },
  { name: "invoice_number", data_type: "text" },
  { name: "issue_date", data_type: "date" },
  { name: "due_date", data_type: "date" },
  { name: "currency", data_type: "text" },
  { name: "total", data_type: "numeric" },
  { name: "paid", data_type: "numeric" },
  { name: "outstanding", data_type: "numeric" },
  { name: "base_status", data_type: "text" },
  { name: "display_status", data_type: "text" },
  { name: "is_overdue", data_type: "boolean" },
  { name: "overdue_days", data_type: "integer" },
  { name: "risk_level", data_type: "text" },
  { name: "po_number", data_type: "text" },
  { name: "notes", data_type: "text" },
  { name: "archived_at", data_type: "timestamp with time zone" },
  { name: "client_is_active", data_type: "boolean" },
  { name: "client_archived_at", data_type: "timestamp with time zone" },
];

export const INVOICES_VIEW_CONTRACT_COLUMN_NAMES = INVOICES_VIEW_CONTRACT_COLUMNS.map(
  (column) => column.name
);
