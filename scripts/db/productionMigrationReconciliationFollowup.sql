-- ============================================================================
-- ARREXIA — Production Migration Reconciliation Follow-Up (READ-ONLY)
-- ============================================================================
--
-- PURPOSE:
--   Targeted diagnostics for FAIL/UNKNOWN results from
--   scripts/db/productionMigrationReconciliationAudit.sql
--
-- SAFETY:
--   SELECT-only. No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE/
--   TRUNCATE/CALL/DO blocks.
--
-- RUN:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/db/productionMigrationReconciliationFollowup.sql
--
-- ============================================================================

-- ============================================================================
-- 1. FOLLOWUP_20260725000000 — workspace_business_date + invoices_view
-- ============================================================================

-- 1A. Function existence (correct 2-arg identity; audit used wrong 1-arg form)
SELECT
  'FOLLOWUP_20260725000000_FUNCTION' AS check_label,
  CASE
    WHEN to_regprocedure('public.workspace_business_date(text, timestamptz)') IS NOT NULL
    THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'workspace_business_date'
    ) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT pg_get_function_identity_arguments(p.oid)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'workspace_business_date'
     ORDER BY p.oid
     LIMIT 1),
    'function missing'
  ) AS detail;

-- 1B. View uses workspace-local aging (not session CURRENT_DATE)
SELECT
  'FOLLOWUP_20260725000000_VIEW_AGING' AS check_label,
  CASE
    WHEN position('workspace_business_date' IN pg_get_viewdef('public.invoices_view'::regclass, true)) > 0
     AND position('CURRENT_DATE' IN pg_get_viewdef('public.invoices_view'::regclass, true)) = 0
    THEN 'PASS'
    WHEN position('workspace_business_date' IN pg_get_viewdef('public.invoices_view'::regclass, true)) > 0
    THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  CASE
    WHEN position('workspace_business_date' IN pg_get_viewdef('public.invoices_view'::regclass, true)) > 0
      THEN 'viewdef references workspace_business_date'
    WHEN position('CURRENT_DATE' IN pg_get_viewdef('public.invoices_view'::regclass, true)) > 0
      THEN 'viewdef still uses CURRENT_DATE (20260721000000 aging semantics)'
    ELSE 'neither workspace_business_date nor CURRENT_DATE found in viewdef'
  END AS detail;

-- 1C. Canonical 21-column contract (ordinal names from invoicesViewContract.ts)
WITH expected(name) AS (
  VALUES
    ('id'), ('workspace_id'), ('client_id'), ('client_name'), ('invoice_number'),
    ('issue_date'), ('due_date'), ('currency'), ('total'), ('paid'),
    ('outstanding'), ('base_status'), ('display_status'), ('is_overdue'),
    ('overdue_days'), ('risk_level'), ('po_number'), ('notes'), ('archived_at'),
    ('client_is_active'), ('client_archived_at')
),
actual AS (
  SELECT column_name, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invoices_view'
)
SELECT
  'FOLLOWUP_20260725000000_VIEW_CONTRACT' AS check_label,
  CASE
    WHEN (SELECT COUNT(*) FROM expected) = (SELECT COUNT(*) FROM actual)
     AND NOT EXISTS (
       SELECT 1
       FROM expected e
       LEFT JOIN actual a ON a.column_name = e.name
       WHERE a.column_name IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
       FROM actual a
       LEFT JOIN expected e ON e.name = a.column_name
       WHERE e.name IS NULL
     )
    THEN 'PASS'
    WHEN (SELECT COUNT(*) FROM actual) = 21 THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  (SELECT COUNT(*)::text || ' columns; expected 21' FROM actual) AS detail;

-- Column-level diff (always emitted for diagnosis)
WITH expected(name) AS (
  VALUES
    ('id'), ('workspace_id'), ('client_id'), ('client_name'), ('invoice_number'),
    ('issue_date'), ('due_date'), ('currency'), ('total'), ('paid'),
    ('outstanding'), ('base_status'), ('display_status'), ('is_overdue'),
    ('overdue_days'), ('risk_level'), ('po_number'), ('notes'), ('archived_at'),
    ('client_is_active'), ('client_archived_at')
),
actual AS (
  SELECT column_name, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invoices_view'
)
SELECT
  'FOLLOWUP_20260725000000_VIEW_COLUMNS' AS check_label,
  COALESCE(a.column_name, e.name) AS column_name,
  CASE
    WHEN a.column_name IS NULL THEN 'MISSING'
    WHEN e.name IS NULL THEN 'EXTRA'
    ELSE 'OK'
  END AS contract_status,
  a.ordinal_position
FROM expected e
FULL OUTER JOIN actual a ON a.column_name = e.name
ORDER BY COALESCE(a.ordinal_position, 999), COALESCE(e.name, a.column_name);

-- ============================================================================
-- 2. FOLLOWUP_20260727000000 — rpc_update_invoice_with_items signature
--    (audit used wrong signature with phantom text parameters)
-- ============================================================================

SELECT
  'FOLLOWUP_20260727000000' AS check_label,
  CASE
    WHEN to_regprocedure(
      'public.rpc_update_invoice_with_items(uuid,uuid,date,date,text,text,text,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)'
    ) IS NOT NULL
    THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_update_invoice_with_items'
    ) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT pg_get_function_identity_arguments(p.oid)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_update_invoice_with_items'
     LIMIT 1),
    'function missing'
  ) AS detail;

SELECT
  'FOLLOWUP_20260727000000_GRANTS' AS check_label,
  CASE
    WHEN has_function_privilege(
      'authenticated',
      'public.rpc_update_invoice_with_items(uuid,uuid,date,date,text,text,text,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)',
      'EXECUTE'
    )
     AND NOT has_function_privilege(
      'anon',
      'public.rpc_update_invoice_with_items(uuid,uuid,date,date,text,text,text,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)',
      'EXECUTE'
    )
    THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'authenticated EXECUTE required; anon revoked' AS detail;

-- ============================================================================
-- 3. FOLLOWUP_20260808150000 — entitlement atomic enforcement (per object)
--    Note: invoices_enforce_trial_usage superseded by 081600 invoices_enforce_entitlement
-- ============================================================================

SELECT
  'FOLLOWUP_20260808150000_internal_entitlement_trial_limit' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_entitlement_trial_limit(text)') IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'trial limit lookup function' AS detail;

SELECT
  'FOLLOWUP_20260808150000_rpc_try_consume_entitlement_usage' AS check_label,
  CASE
    WHEN to_regprocedure('public.rpc_try_consume_entitlement_usage(uuid,text,integer)') IS NOT NULL
     AND has_function_privilege(
       'service_role',
       'public.rpc_try_consume_entitlement_usage(uuid,text,integer)',
       'EXECUTE'
     )
     AND NOT has_function_privilege(
       'authenticated',
       'public.rpc_try_consume_entitlement_usage(uuid,text,integer)',
       'EXECUTE'
     )
    THEN 'PASS'
    WHEN to_regprocedure('public.rpc_try_consume_entitlement_usage(uuid,text,integer)') IS NOT NULL
    THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'service_role-only consume RPC' AS detail;

SELECT
  'FOLLOWUP_20260808150000_rpc_release_entitlement_usage' AS check_label,
  CASE
    WHEN to_regprocedure('public.rpc_release_entitlement_usage(uuid,text,integer)') IS NOT NULL
      OR to_regprocedure('public.rpc_release_entitlement_usage(uuid,text,integer,uuid)') IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT string_agg(
       pg_get_function_identity_arguments(p.oid), '; ' ORDER BY p.oid
     )
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_release_entitlement_usage'),
    'function missing'
  ) AS detail;

SELECT
  'FOLLOWUP_20260808150000_internal_import_entitlement_state' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_import_entitlement_state(uuid)') IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'import entitlement resolver' AS detail;

SELECT
  'FOLLOWUP_20260808150000_internal_import_entitlement_preflight' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
     AND has_function_privilege(
       'service_role',
       'public.internal_import_entitlement_preflight(uuid,integer,integer)',
       'EXECUTE'
     )
    THEN 'PASS'
    WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
    THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'import preflight RPC (proven by working invoice import)' AS detail;

SELECT
  'FOLLOWUP_20260808150000_clients_enforce_entitlement_capacity' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE c.relname = 'clients'
        AND t.tgname = 'clients_enforce_entitlement_capacity'
        AND p.proname = 'trg_clients_enforce_capacity'
        AND NOT t.tgisinternal
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'BEFORE INSERT trigger on clients' AS detail;

SELECT
  'FOLLOWUP_20260808150000_invoices_enforce_trial_usage' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'invoices_enforce_trial_usage' AND NOT tgisinternal
    ) THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgname = 'invoices_enforce_entitlement'
        AND p.proname = 'trg_invoices_enforce_entitlement'
        AND NOT t.tgisinternal
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  '081500 trial_usage trigger OR 081600 superseding invoices_enforce_entitlement' AS detail;

SELECT
  'FOLLOWUP_20260808150000_rpc_import_clients_wrapper' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'rpc_import_clients'
        AND p.prosrc ILIKE '%internal_import_entitlement_preflight%'
    ) THEN 'PASS'
    WHEN to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'rpc_import_clients delegates through entitlement preflight' AS detail;

-- ============================================================================
-- 4. FOLLOWUP_20260808160000_IMPORT_BODY — superseded; check 10120000 contract
-- ============================================================================

SELECT
  'FOLLOWUP_20260808160000_IMPORT_BODY' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL'
    WHEN p.prosrc ILIKE '%workspace_entitlement_reservations%' THEN 'UNKNOWN'
    ELSE 'PASS'
  END AS result,
  '08160000 import body intentionally superseded by 10120000; outstanding_amount= stale' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'internal_import_invoices_grouped'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

-- ============================================================================
-- 5. FOLLOWUP_20260809100000 — reminders.scheduled_at (HIGH PRIORITY)
-- ============================================================================

SELECT
  'FOLLOWUP_20260809100000_COLUMN' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reminders'
        AND column_name = 'scheduled_at'
        AND udt_name = 'date'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'reminders.scheduled_at date column' AS detail;

SELECT
  'FOLLOWUP_20260809100000_COLUMN_META' AS check_label,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  COALESCE(col_description(pgc.oid, c.ordinal_position), '') AS comment
FROM information_schema.columns c
JOIN pg_class pgc ON pgc.relname = c.table_name
JOIN pg_namespace n ON n.oid = pgc.relnamespace AND n.nspname = c.table_schema
WHERE c.table_schema = 'public'
  AND c.table_name = 'reminders'
  AND c.column_name = 'scheduled_at';

SELECT
  'FOLLOWUP_20260809100000_INDEXES' AS check_label,
  COALESCE(
    (SELECT string_agg(indexname || ': ' || indexdef, '; ')
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'reminders'
       AND indexdef ILIKE '%scheduled_at%'),
    'none'
  ) AS indexes_on_scheduled_at;

SELECT
  'FOLLOWUP_20260809100000_REMINDERS_COLUMNS' AS check_label,
  column_name,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reminders'
ORDER BY ordinal_position;

SELECT
  'FOLLOWUP_20260809100000_FUNCTION_REFS' AS check_label,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE
    WHEN p.prosrc ILIKE '%scheduled_at%' THEN 'references scheduled_at'
    ELSE 'no reference'
  END AS scheduled_at_usage
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%scheduled_at%'
ORDER BY p.proname;

-- ============================================================================
-- 6. FOLLOWUP_20260810120000 — corrected final import contract checks
-- ============================================================================

SELECT
  'FOLLOWUP_20260810120000_INTERNAL_NO_OUTSTANDING_AMOUNT' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL'
    ELSE 'PASS'
  END AS result,
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('internal_import_invoices_grouped', 'import_invoices_grouped')
ORDER BY p.proname;

SELECT
  'FOLLOWUP_20260810120000_INTERNAL_BATCH_ATOMICITY' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%DELETE FROM public.invoice_items%'
     AND p.prosrc ILIKE '%invoice_import_failed%'
    THEN 'PASS'
    WHEN p.prosrc ILIKE '%DELETE FROM public.invoice_items%' THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'internal_import_invoices_grouped: per-invoice item delete + execute rollback' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'internal_import_invoices_grouped'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

SELECT
  'FOLLOWUP_20260810120000_WRAPPER_NET_NEW_PREFLIGHT' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%internal_import_entitlement_preflight%'
     AND p.prosrc ILIKE '%v_new_invoices%'
     AND p.prosrc ILIKE '%archived_at IS NULL%'
    THEN 'PASS'
    WHEN p.prosrc ILIKE '%internal_import_entitlement_preflight%' THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'import_invoices_grouped wrapper: net-new invoice preflight' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'import_invoices_grouped'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

SELECT
  'FOLLOWUP_20260810120000_HISTORY' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260810120000'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'schema_migrations history row' AS detail;

SELECT
  'FOLLOWUP_20260810120000' AS check_label,
  CASE
    WHEN (
      SELECT COUNT(*) FILTER (WHERE check_label = 'pass_marker' AND result = 'FAIL')
      FROM (
        SELECT
          'pass_marker' AS check_label,
          CASE WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL' ELSE 'PASS' END AS result
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'internal_import_invoices_grouped'
          AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
        LIMIT 1
      ) x
    ) = 0
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'internal_import_invoices_grouped'
         AND p.prosrc ILIKE '%DELETE FROM public.invoice_items%'
         AND p.prosrc ILIKE '%invoice_import_failed%'
     )
     AND EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations
       WHERE version = '20260810120000'
     )
    THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'composite: no outstanding_amount + batch markers + history (external import PASS confirms)' AS detail;

-- ============================================================================
-- 7. FOLLOWUP_20260812120000 — client import hardening (per object)
-- ============================================================================

SELECT
  'FOLLOWUP_20260812120000_parser_function' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_parse_client_import_payment_terms_days(jsonb)') IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'payment terms parser helper' AS detail;

SELECT
  'FOLLOWUP_20260812120000_internal_rpc_import_clients' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_rpc_import_clients(uuid,jsonb,boolean)') IS NOT NULL
    THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'internal_rpc_import_clients'
    ) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT pg_get_function_identity_arguments(p.oid)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'internal_rpc_import_clients'
     LIMIT 1),
    'function missing'
  ) AS detail;

SELECT
  'FOLLOWUP_20260812120000_body_markers' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%internal_parse_client_import_payment_terms_days%'
     AND p.prosrc ILIKE '%client_import_failed%'
     AND p.prosrc ILIKE '%p_dry_run%'
    THEN 'PASS'
    WHEN p.prosrc ILIKE '%internal_parse_client_import_payment_terms_days%' THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'atomic batch markers in internal_rpc_import_clients body' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'internal_rpc_import_clients'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

SELECT
  'FOLLOWUP_20260812120000_rpc_import_clients_wrapper' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%internal_import_entitlement_preflight%'
     AND p.prosrc ILIKE '%internal_rpc_import_clients%'
    THEN 'PASS'
    WHEN to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'wrapper: preflight + delegate to internal_rpc_import_clients' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_import_clients'
LIMIT 1;

SELECT
  'FOLLOWUP_20260812120000_grants' AS check_label,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE
    WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'service_role EXECUTE; authenticated revoked' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'internal_parse_client_import_payment_terms_days',
    'internal_rpc_import_clients',
    'rpc_import_clients'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
