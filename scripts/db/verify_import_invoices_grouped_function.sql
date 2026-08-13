-- READ-ONLY: verify deployed import_invoices_grouped does not reference dropped columns.
-- Run in Supabase SQL editor against production (no writes).

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE
    WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL — references invoices.outstanding_amount'
    WHEN p.prosrc ILIKE '%total_paid%' AND p.prosrc ILIKE '%INSERT INTO%invoices%' THEN 'WARN — may reference dropped total_paid on insert'
    WHEN p.prosrc ILIKE '%payment_state%' AND p.prosrc ILIKE '%INSERT INTO%invoices%' THEN 'WARN — may reference dropped payment_state on insert'
    ELSE 'PASS — no derived-column writes detected in function body'
  END AS import_function_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('internal_import_invoices_grouped', 'import_invoices_grouped')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Expected canonical signature:
-- import_invoices_grouped(p_workspace_id uuid, p_rows jsonb, p_dry_run boolean)

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invoices'
  AND column_name IN ('amount', 'status', 'outstanding_amount', 'total_paid', 'payment_state')
ORDER BY column_name;

-- invoices_view derived fields (should exist here, not on base table)
SELECT
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invoices_view'
  AND column_name IN ('total', 'paid', 'outstanding', 'display_status')
ORDER BY column_name;
