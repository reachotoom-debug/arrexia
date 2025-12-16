-- ============================================================================
-- Create payments_view for server-side sorting/searching across all pages
-- This view includes joined client_name, invoice_number, and computed is_failed
-- to enable proper server-side operations that work across pagination.
-- ============================================================================

-- Step 1: Drop existing view if it exists
DROP VIEW IF EXISTS public.payments_view;

-- Step 2: Create payments_view with all necessary columns
CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  p.id,
  p.workspace_id,
  p.invoice_id,
  COALESCE(p.payment_date, p.created_at::date) AS payment_date,
  p.amount,
  COALESCE(p.currency, i.currency, c.currency, s.default_currency, 'USD') AS currency,
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
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id;

-- Step 3: Add comment documenting the view
COMMENT ON VIEW public.payments_view IS 
'Payments view with joined client_name, invoice_number, and computed is_failed for server-side sorting/searching. Required columns: id, workspace_id, invoice_id, payment_date (coalesced), amount, currency (coalesced from payment/invoice/client/settings), method, status, transaction_id, notes, payment_provider, created_at, updated_at, invoice_number (nullable), client_name (nullable), is_failed (boolean), paid_at (payment_date). Use this view for list queries that need to sort/search by client_name, invoice_number, or prioritize failed payments.';

-- Step 4: Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
