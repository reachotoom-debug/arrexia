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
-- - Computes paid/outstanding from payments sum only
--
-- View dependency order:
-- 1. invoices_view (base view, already exists)
-- 2. invoice_risk_view (depends on invoices_view)
--
-- This migration drops invoice_risk_view first, then recreates it.
-- ============================================================================

DO $$
BEGIN
  -- Check if invoices_view exists (required dependency)
  IF to_regclass('public.invoices_view') IS NULL THEN
    RAISE NOTICE 'Skipping invoice_risk_view recreation: base view public.invoices_view does not exist.';
    RETURN;
  END IF;

  -- Drop existing view if it exists (must drop before recreating)
  EXECUTE 'DROP VIEW IF EXISTS public.invoice_risk_view CASCADE';

  -- Create the risk view as a thin layer over invoices_view
  -- Filters: only overdue invoices with outstanding > 0 and valid workspace_id
  EXECUTE $sql$
CREATE VIEW public.invoice_risk_view AS
SELECT
  workspace_id,
  id AS invoice_id,
  client_id,
  client_name,
  invoice_number,
  issue_date,
  due_date,
  currency,
  total,
  paid,
  outstanding,
  overdue_days,
  risk_level,
  display_status
FROM public.invoices_view
WHERE display_status = 'overdue'
  AND outstanding > 0
  AND workspace_id IS NOT NULL;
  $sql$;

  -- Reload PostgREST schema cache
  PERFORM pg_notify('pgrst', 'reload schema');

  -- Add comment to document the view
  EXECUTE $sql$
COMMENT ON VIEW public.invoice_risk_view IS 
  'Thin view over invoices_view for dashboard/risk pages. Includes only overdue invoices (display_status = ''overdue'') with outstanding > 0 and valid workspace_id. Excludes archived invoices and archived payments implicitly via invoices_view. Recommended ordering: ORDER BY risk_level, overdue_days DESC, outstanding DESC.';
  $sql$;
END
$$;

-- ============================================================================
-- Verification Queries (run these manually to verify the migration)
-- ============================================================================
--
-- 1) Count total rows in invoice_risk_view
-- Expected: Should match count of overdue invoices with outstanding > 0
-- SELECT count(*) FROM public.invoice_risk_view;
--
-- 2) Verify no NULL workspace_id (must be 0)
-- Expected: 0 (all rows must have workspace_id)
-- SELECT count(*) FROM public.invoice_risk_view WHERE workspace_id IS NULL;
--
-- 3) Compare counts: invoices_view vs invoice_risk_view
-- Expected: Both counts should match
-- SELECT 
--   (SELECT count(*) 
--    FROM public.invoices_view 
--    WHERE display_status = 'overdue' 
--      AND outstanding > 0 
--      AND workspace_id IS NOT NULL) AS invoices_view_count,
--   (SELECT count(*) FROM public.invoice_risk_view) AS invoice_risk_view_count;
--
-- 4) Verify risk_level distribution
-- Expected: Should show high/medium/low risk levels
-- SELECT risk_level, count(*) 
-- FROM public.invoice_risk_view 
-- GROUP BY risk_level
-- ORDER BY 
--   CASE risk_level
--     WHEN 'high' THEN 1
--     WHEN 'medium' THEN 2
--     WHEN 'low' THEN 3
--     ELSE 4
--   END;
--
-- 5) Verify archived invoices are excluded (should be 0)
-- Expected: 0 (invoices_view already excludes archived)
-- SELECT count(*) 
-- FROM public.invoice_risk_view irv
-- JOIN public.invoices i ON i.id = irv.invoice_id
-- WHERE i.archived_at IS NOT NULL;
--
-- 6) Sample rows for manual inspection
-- SELECT * 
-- FROM public.invoice_risk_view 
-- ORDER BY 
--   CASE risk_level
--     WHEN 'high' THEN 1
--     WHEN 'medium' THEN 2
--     WHEN 'low' THEN 3
--     ELSE 4
--   END,
--   overdue_days DESC,
--   outstanding DESC
-- LIMIT 20;
-- ============================================================================
