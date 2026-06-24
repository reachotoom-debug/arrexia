-- ============================================================================
-- Contract-lock payments_view: includes ALL payments (archived + active)
-- App must filter by archived_at:
--   active:   .is("archived_at", null)
--   archived: .not("archived_at", "is", null)
-- ============================================================================

DO $$
BEGIN
  -- Check if payments table exists
  IF to_regclass('public.payments') IS NULL THEN
    RAISE NOTICE 'Skipping payments_view contract lock migration: table public.payments does not exist.';
    RETURN;
  END IF;

  -- Verify required columns exist before creating view
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'proof_url'
  ) THEN
    RAISE NOTICE 'Skipping payments_view: required column payments.proof_url does not exist. Run payments_contract_columns migration first.';
    RETURN;
  END IF;

  -- Drop existing view to avoid column rename errors
  EXECUTE 'DROP VIEW IF EXISTS public.payments_view CASCADE';

  -- Create the view
  EXECUTE $sql$
CREATE VIEW public.payments_view AS
SELECT
  p.id,
  p.workspace_id,
  p.invoice_id,
  p.client_id,
  p.amount,
  COALESCE(p.currency, i.currency, s.default_currency, 'USD') AS currency,
  p.transaction_fee,
  p.net_amount,
  p.payment_date,
  p.method,
  p.status,
  p.transaction_id,
  p.proof_url,
  p.notes,
  p.payment_provider,
  p.created_at,
  p.updated_at,
  p.archived_at,
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  COALESCE(p.payment_date::timestamptz, p.created_at) AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = COALESCE(p.client_id, i.client_id)
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id;
  $sql$;

  -- Reload PostgREST schema cache
  PERFORM pg_notify('pgrst', 'reload schema');

  -- Add comment
  EXECUTE $sql$
COMMENT ON VIEW public.payments_view IS
'Payments view with joined client_name and invoice_number for sorting/searching. Includes ALL payments (archived and active). App must filter by archived_at. Currency fallback: p.currency -> i.currency -> s.default_currency -> ''USD''. Required columns: id, workspace_id, invoice_id, client_id, amount, currency, transaction_fee, net_amount, payment_date, method, status, transaction_id, proof_url, notes, payment_provider, created_at, updated_at, archived_at, invoice_number (from invoices), client_name (from clients), is_failed, paid_at.';
  $sql$;
END
$$;
