-- ============================================================================
-- FINTECH/AR HARD FIX: Ensure payments_view NEVER includes archived payments
-- ============================================================================
-- 
-- CRITICAL: payments_view MUST represent ACTIVE payments only.
-- Archived payments must NEVER appear in active payment lists.
-- Archived payments must NEVER affect invoice paid totals or outstanding calculations.
--
-- This migration enforces:
-- 1. Base selection: WHERE p.archived_at IS NULL (excludes archived payments)
-- ============================================================================

-- Drop dependent views if any (none currently, but safe to check)
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
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  p.payment_date AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = i.client_id
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id
WHERE p.archived_at IS NULL;  -- ✅ CRITICAL: Exclude archived payments by default

-- Reload PostgREST schema cache (important for Supabase API)
SELECT pg_notify('pgrst', 'reload schema');

-- Add comment to document the view contract
COMMENT ON VIEW public.payments_view IS 
  'Payments view with joined client_name, invoice_number, and computed is_failed for server-side sorting/searching. Represents ACTIVE payments only (excludes archived). Required columns: id, workspace_id, invoice_id, payment_date (coalesced), amount, currency (coalesced from payment/invoice/client/settings), method, status, transaction_id, notes, payment_provider, created_at, updated_at, invoice_number (nullable), client_name (nullable), is_failed (boolean), paid_at (payment_date). ONLY includes non-archived payments (WHERE p.archived_at IS NULL). Use this view for list queries that need to sort/search by client_name, invoice_number, or prioritize failed payments. Archived payments are excluded to maintain financial integrity - they do not affect invoice paid totals or outstanding calculations.';

