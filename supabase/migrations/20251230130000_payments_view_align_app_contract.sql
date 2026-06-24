-- ============================================================================
-- Align payments_view contract with app's selectString
-- ============================================================================
--
-- App selects: archived_at, invoice_number, client_name, is_failed, paid_at
-- This migration recreates payments_view to match the app's contract:
-- - p.* includes all core payment columns (including archived_at)
-- - i.invoice_number as invoice_number
-- - c.name as client_name
-- - (p.status='failed') as is_failed
-- - COALESCE(p.payment_date, p.created_at) as paid_at
-- - WHERE p.archived_at IS NULL (active-only view)
-- ============================================================================

DROP VIEW IF EXISTS public.payments_view;

CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  p.*,
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  COALESCE(p.payment_date, p.created_at) AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = i.client_id
WHERE p.archived_at IS NULL;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

