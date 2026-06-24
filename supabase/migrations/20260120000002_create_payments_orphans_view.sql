-- ============================================================================
-- Create payments_orphans view for health checks
-- ============================================================================
-- 
-- Payments where invoice_id is not null but the invoice doesn't exist
-- ============================================================================

DROP VIEW IF EXISTS public.payments_orphans;

CREATE OR REPLACE VIEW public.payments_orphans AS
SELECT 
  p.id,
  p.workspace_id,
  p.invoice_id,
  p.amount,
  p.payment_date,
  p.created_at
FROM public.payments p
WHERE 
  p.invoice_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM public.invoices i 
    WHERE i.id = p.invoice_id 
      AND i.workspace_id = p.workspace_id
  );

-- Add comment
COMMENT ON VIEW public.payments_orphans IS 
  'Payments with invoice_id pointing to non-existent invoices (orphan payments).';

-- Force PostgREST to reload schema
SELECT pg_notify('pgrst', 'reload schema');

