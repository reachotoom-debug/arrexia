-- ============================================================================
-- Fix payments_view contract - ensure active-only behavior and stable columns
-- ============================================================================
-- 
-- This migration recreates payments_view with a stable contract that:
-- 1. Includes all required columns: id, workspace_id, invoice_id, payment_date,
--    amount, currency, method, status, transaction_id, notes, payment_provider,
--    created_at, updated_at, archived_at, invoice_number, client_name
-- 2. Enforces active-only behavior: WHERE p.archived_at IS NULL
-- 3. Uses LEFT JOIN for invoices and clients (safe for null invoice_id)
-- 4. Reloads PostgREST schema cache
-- ============================================================================

DROP VIEW IF EXISTS public.payments_view;

CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  p.id,
  p.workspace_id,
  p.invoice_id,
  COALESCE(p.payment_date, p.created_at::date) AS payment_date,
  p.amount,
  COALESCE(p.currency, i.currency, s.default_currency, 'USD') AS currency,
  p.method,
  p.status,
  p.transaction_id,
  p.notes,
  p.payment_provider,
  p.created_at,
  p.updated_at,
  p.archived_at,
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  p.payment_date AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = i.client_id
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id
WHERE p.archived_at IS NULL;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- Add comment documenting the view contract
COMMENT ON VIEW public.payments_view IS 
  'Payments view with joined client_name and invoice_number for server-side sorting/searching. Represents ACTIVE payments only (excludes archived). Required columns: id, workspace_id, invoice_id, payment_date (coalesced from payment_date or created_at), amount, currency (coalesced from payment/invoice/client/settings), method, status, transaction_id, notes, payment_provider, created_at, updated_at, archived_at, invoice_number (nullable from invoices.invoice_number), client_name (nullable from clients.name), is_failed (boolean derived from status=''failed''), paid_at (alias to payment_date). ONLY includes non-archived payments (WHERE p.archived_at IS NULL). Use this view for active payment lists. Archived payments are excluded to maintain financial integrity - they do not affect invoice paid totals or outstanding calculations.';

