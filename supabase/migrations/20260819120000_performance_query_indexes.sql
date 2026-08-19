-- ============================================================================
-- Performance: indexes for invoice payment aggregation and reminder lookups
-- ============================================================================
-- Supports:
-- - invoices_view payment aggregation by invoice_id
-- - invoice detail payment lookup (.eq("invoice_id", ...))
-- - getEligibleReminders / Action Center reminder history by workspace + invoice
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id_active
  ON public.payments (invoice_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reminders_workspace_invoice
  ON public.reminders (workspace_id, invoice_id);
