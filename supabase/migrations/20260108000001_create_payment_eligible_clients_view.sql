-- ============================================================================
-- Create payment_eligible_clients view (standardized)
-- ============================================================================
-- 
-- This view provides a workspace-scoped list of clients eligible for payment recording.
-- Eligibility criteria:
-- - Client: archived_at IS NULL AND is_active = true
-- - Invoice: display_status IN ('sent','overdue','partially_paid') AND outstanding > 0
-- 
-- The view joins clients with invoices_view to ensure consistency.
-- ============================================================================

DO $$
BEGIN
  -- Check if clients table exists
  IF to_regclass('public.clients') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients view: table public.clients does not exist.';
    RETURN;
  END IF;

  -- Check if invoices_view exists
  IF to_regclass('public.invoices_view') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients view: view public.invoices_view does not exist.';
    RETURN;
  END IF;

  -- Check if invoices table exists
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients view: table public.invoices does not exist.';
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.payment_eligible_clients CASCADE';

  EXECUTE $sql$
CREATE VIEW public.payment_eligible_clients AS
SELECT
  c.id AS client_id,
  c.workspace_id,
  c.name,
  c.email,
  c.whatsapp,
  c.is_active,
  c.archived_at,
  COUNT(DISTINCT iv.id) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ) AS open_invoices_count,
  COALESCE(SUM(iv.outstanding) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ), 0) AS total_outstanding
FROM public.clients c
JOIN public.invoices_view iv
  ON iv.client_id = c.id AND iv.workspace_id = c.workspace_id
JOIN public.invoices inv
  ON inv.id = iv.id
WHERE
  iv.outstanding > 0
  AND iv.display_status IN ('sent','overdue','partially_paid')
  AND inv.archived_at IS NULL
GROUP BY
  c.id, c.workspace_id, c.name, c.email, c.whatsapp, c.is_active, c.archived_at
HAVING
  COUNT(DISTINCT iv.id) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ) > 0;
  $sql$;

  PERFORM pg_notify('pgrst', 'reload schema');

  EXECUTE $sql$
COMMENT ON VIEW public.payment_eligible_clients IS
  'Returns active, non-archived clients with at least one invoice eligible for payment recording. Eligibility: client.archived_at IS NULL AND client.is_active = true AND invoice.display_status IN (''sent'',''overdue'',''partially_paid'') AND invoice.outstanding > 0. Workspace-scoped. Use this view for Record Payment client dropdown queries.';
  $sql$;
END
$$;
