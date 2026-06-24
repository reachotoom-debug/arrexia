-- ============================================================================
-- Update payments_view to include archived payments and expose archived_at
-- ============================================================================
-- 
-- PROBLEM:
-- payments_view currently excludes archived payments at SQL level (WHERE p.archived_at IS NULL),
-- causing archived tab to query base payments table which lacks client_name and invoice_number.
--
-- SOLUTION:
-- Remove the WHERE clause exclusion and expose archived_at column.
-- Let the application filter by archived_at for active vs archived tabs.
-- This ensures consistent column structure across all tabs.
--
-- This migration:
-- 1. Removes WHERE p.archived_at IS NULL (includes all payments, archived and active)
-- 2. Adds p.archived_at to SELECT list (exposes archived_at for filtering)
-- 3. Keeps all joined columns (client_name, invoice_number, etc.)
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
  p.archived_at,  -- ✅ Expose archived_at for application-level filtering
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  p.payment_date AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = i.client_id
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id;
-- ✅ Removed WHERE p.archived_at IS NULL - view now includes all payments
-- Application must filter by archived_at: .is("archived_at", null) for active, .not("archived_at", "is", null) for archived

-- Reload PostgREST schema cache (important for Supabase API)
SELECT pg_notify('pgrst', 'reload schema');

-- Add comment to document the view contract
COMMENT ON VIEW public.payments_view IS 
  'Payments view with joined client_name, invoice_number, and computed is_failed for server-side sorting/searching. Includes ALL payments (archived and active). Required columns: id, workspace_id, invoice_id, payment_date (coalesced), amount, currency (coalesced from payment/invoice/client/settings), method, status, transaction_id, notes, payment_provider, created_at, updated_at, archived_at (exposed for filtering), invoice_number (nullable), client_name (nullable), is_failed (boolean), paid_at (payment_date). Application must filter by archived_at: use .is("archived_at", null) for active payments, .not("archived_at", "is", null) for archived payments. Use this view for all list queries to ensure consistent column structure across active and archived tabs.';

