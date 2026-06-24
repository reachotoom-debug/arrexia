-- ============================================================================
-- Recreate invoice_risk_view: select overdue invoices from invoices_view
-- ============================================================================
-- 
-- This view selects overdue invoices from invoices_view.
-- It does NOT reference invoices table columns that were dropped:
-- - invoices.total_paid (removed, now computed from payments)
-- - invoices.outstanding_amount (removed, now computed from payments)
-- - invoices.payment_state (removed, now computed as display_status)
--
-- All data comes from invoices_view, which already:
-- - Excludes archived invoices (invoices.archived_at IS NULL)
-- - Excludes archived payments from paid calculations (payments.archived_at IS NULL)
-- - Computes risk_level only for overdue invoices (display_status = 'overdue')
-- ============================================================================

DROP VIEW IF EXISTS public.invoice_risk_view;

CREATE VIEW public.invoice_risk_view AS
SELECT
  v.workspace_id,
  v.client_id,
  v.client_name,
  v.id AS invoice_id,
  v.invoice_number,
  v.due_date,
  v.total,
  v.paid,
  v.outstanding,
  v.overdue_days,
  v.risk_level
FROM public.invoices_view v
WHERE v.display_status = 'overdue';

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification Queries (run these manually to verify the migration)
-- ============================================================================

-- 1) Count total rows in invoice_risk_view
-- SELECT count(*) FROM public.invoice_risk_view;

-- 2) Count rows by risk_level
-- SELECT risk_level, count(*) FROM public.invoice_risk_view GROUP BY risk_level;
