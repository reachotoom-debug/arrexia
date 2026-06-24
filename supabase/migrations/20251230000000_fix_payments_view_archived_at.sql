-- ============================================================================
-- Fix payments_view to include archived_at and all required columns
-- ============================================================================
-- 
-- PROBLEM:
-- App queries payments_view with archived_at but DB view doesn't include it,
-- causing error 42703 (column does not exist).
--
-- SOLUTION:
-- Recreate payments_view with ALL required columns including archived_at.
-- Include invoice_number and client_name for ALL payments (archived and active).
-- Do NOT exclude archived payments at SQL level - app will filter by archived_at.
--
-- This migration:
-- 1. Drops existing payments_view
-- 2. Recreates with archived_at column (CRITICAL)
-- 3. Includes all joined columns (invoice_number, client_name)
-- 4. No WHERE clause exclusion (includes all payments)
-- 5. Reloads PostgREST schema cache
-- ============================================================================

-- Drop existing view
DROP VIEW IF EXISTS public.payments_view;

-- Recreate payments_view with ALL required columns including archived_at
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
  p.archived_at,  -- ✅ CRITICAL: Expose archived_at for application-level filtering
  i.invoice_number AS invoice_number,  -- ✅ From invoices table (nullable if invoice_id is null)
  c.name AS client_name,  -- ✅ From clients table (nullable if invoice_id is null)
  (p.status = 'failed') AS is_failed,  -- ✅ Boolean derived from status='failed'
  p.payment_date AS paid_at  -- ✅ Alias to payment_date for sorting
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = i.client_id
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id;
-- ✅ NO WHERE clause - includes ALL payments (archived and active)
-- Application must filter by archived_at: .is("archived_at", null) for active, .not("archived_at", "is", null) for archived

-- Reload PostgREST schema cache (important for Supabase API)
SELECT pg_notify('pgrst', 'reload schema');

-- Add comment to document the view contract
COMMENT ON VIEW public.payments_view IS 
  'Payments view with joined client_name, invoice_number, and computed is_failed for server-side sorting/searching. Includes ALL payments (archived and active). Required columns: id, workspace_id, invoice_id, payment_date (coalesced from payment_date or created_at), amount, currency (coalesced from payment/invoice/client/settings), method, status, transaction_id, notes, payment_provider, created_at, updated_at, archived_at (CRITICAL - exposed for filtering), invoice_number (nullable from invoices.invoice_number), client_name (nullable from clients.name), is_failed (boolean derived from status=''failed''), paid_at (alias to payment_date). Application must filter by archived_at: use .is("archived_at", null) for active payments, .not("archived_at", "is", null) for archived payments. Use this view for all list queries to ensure consistent column structure across active and archived tabs.';

