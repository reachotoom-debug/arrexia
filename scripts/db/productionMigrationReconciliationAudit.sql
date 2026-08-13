-- ============================================================================
-- ARREXIA — Production Migration Reconciliation Audit (READ-ONLY)
-- ============================================================================
--
-- PURPOSE:
--   Verify whether local migrations with blank Supabase Remote history already
--   have their intended schema/function/policy effects in production.
--
-- SAFETY:
--   SELECT-only. No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE.
--   Do NOT run db push, migration repair, or apply migrations from this file.
--
-- RUN (Supabase SQL editor or psql against production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/db/productionMigrationReconciliationAudit.sql
--
-- INTERPRETATION:
--   PASS    — intended effect appears present
--   FAIL    — intended effect appears absent or contradicted
--   UNKNOWN — inconclusive (inspect detail columns / function bodies manually)
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Migration history snapshot (read-only)
-- ---------------------------------------------------------------------------
SELECT 'MIGRATION_HISTORY_SNAPSHOT' AS section;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- ---------------------------------------------------------------------------
-- Helper: financial view security_invoker check (reused by 20260729000000)
-- ---------------------------------------------------------------------------
WITH view_invoker AS (
  SELECT
    c.relname AS view_name,
    EXISTS (
      SELECT 1 FROM unnest(COALESCE(c.reloptions, ARRAY[]::text[])) opt
      WHERE opt = 'security_invoker=true'
    ) AS security_invoker_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND c.relname IN (
      'invoices_view',
      'payments_view',
      'invoice_risk_view',
      'payment_eligible_clients',
      'payments_orphans'
    )
)
SELECT * FROM view_invoker ORDER BY view_name;

-- ---------------------------------------------------------------------------
-- 20260115000000 — archived_at on invoices_view
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260115000000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoices_view'
        AND column_name = 'archived_at'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'invoices_view.archived_at column' AS detail;

-- ---------------------------------------------------------------------------
-- 20260119000000 — branding/payment settings columns
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260119000000_EFFECT' AS check_label,
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settings'
        AND column_name IN (
          'branding_business_legal_name',
          'payment_bank_iban',
          'invoice_thank_you_note',
          'timezone'
        )
    ) = 4 THEN 'PASS'
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settings'
        AND column_name IN (
          'branding_business_legal_name',
          'payment_bank_iban',
          'invoice_thank_you_note',
          'timezone'
        )
    ) > 0 THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  (
    SELECT string_agg(column_name, ', ' ORDER BY column_name)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings'
      AND column_name IN (
        'branding_business_legal_name',
        'payment_bank_iban',
        'invoice_thank_you_note',
        'timezone'
      )
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260122000000 — realtime invoice/payment view consistency
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260122000000_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.invoices_view') IS NOT NULL
     AND to_regclass('public.payments_view') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'invoices_view'
         AND column_name IN ('paid', 'outstanding', 'display_status')
     ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'invoices_view + payments_view financial columns' AS detail;

-- ---------------------------------------------------------------------------
-- 20260622130000 — founder admin console tables
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260622130000_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.admin_users') IS NOT NULL
     AND to_regclass('public.admin_audit_logs') IS NOT NULL
     AND to_regclass('public.workspace_subscriptions') IS NOT NULL
     AND (
       SELECT bool_and(rowsecurity)
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('admin_users', 'admin_audit_logs', 'workspace_subscriptions')
     ) THEN 'PASS'
    WHEN to_regclass('public.admin_users') IS NOT NULL
      OR to_regclass('public.workspace_subscriptions') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'admin_users, admin_audit_logs, workspace_subscriptions + RLS' AS detail;

-- ---------------------------------------------------------------------------
-- 20260706000000 — newsletter_subscribers
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260706000000_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.newsletter_subscribers') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relname = 'newsletter_subscribers'
         AND t.tgname = 'newsletter_subscribers_set_updated_at'
         AND NOT t.tgisinternal
     ) THEN 'PASS'
    WHEN to_regclass('public.newsletter_subscribers') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'newsletter_subscribers table + updated_at trigger' AS detail;

-- ---------------------------------------------------------------------------
-- 20260721000000 — invoices_view client status contract
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260721000000_EFFECT' AS check_label,
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoices_view'
        AND column_name IN ('client_is_active', 'client_archived_at')
    ) = 2 THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'invoices_view.client_is_active + client_archived_at' AS detail;

-- ---------------------------------------------------------------------------
-- 20260722000000 — normalize reminder_rules trigger_type
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260722000000_EFFECT' AS check_label,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.reminder_rules
      WHERE trigger_type = 'relative_to_due_date'
    )
     AND NOT EXISTS (
       SELECT 1 FROM public.reminder_rules
       WHERE offset_days < 0
     ) THEN 'PASS'
    WHEN to_regclass('public.reminder_rules') IS NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT string_agg(trigger_type || '=' || cnt::text, ', ' ORDER BY trigger_type)
     FROM (
       SELECT trigger_type, COUNT(*) AS cnt
       FROM public.reminder_rules
       GROUP BY trigger_type
     ) s),
    'no reminder_rules rows'
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260723000000 — R2F automation settings columns
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260723000000_EFFECT' AS check_label,
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settings'
        AND column_name IN ('auto_send_reminders', 'reminder_before_days', 'reminder_after_days')
    ) = 3 THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'settings auto_send_reminders + reminder_before/after_days' AS detail;

-- ---------------------------------------------------------------------------
-- 20260723010000 — auto_send_reminders default false
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260723010000_EFFECT' AS check_label,
  CASE
    WHEN (
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settings'
        AND column_name = 'auto_send_reminders'
    ) ILIKE '%false%' THEN 'PASS'
    WHEN (
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'settings'
        AND column_name = 'auto_send_reminders'
    ) IS NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  (
    SELECT column_default::text
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings'
      AND column_name = 'auto_send_reminders'
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260725000000 — workspace_business_date + invoices_view aging
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260725000000_EFFECT' AS check_label,
  CASE
    WHEN to_regprocedure('public.workspace_business_date(text)') IS NOT NULL
     AND (
       SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'invoices_view'
     ) = 21 THEN 'PASS'
    WHEN to_regprocedure('public.workspace_business_date(text)') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'workspace_business_date() + 21-column invoices_view contract' AS detail;

-- ---------------------------------------------------------------------------
-- 20260725100000 — restrict import RPCs to service_role
-- ---------------------------------------------------------------------------
WITH import_grants AS (
  SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args,
    array_agg(DISTINCT grantee.rolname ORDER BY grantee.rolname) AS grantees
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'import_invoices_grouped',
      'rpc_import_clients',
      'rpc_import_invoices',
      'rpc_import_payments'
    )
    AND acl.privilege_type = 'EXECUTE'
  GROUP BY p.proname, p.oid
)
SELECT
  'MIGRATION_20260725100000_EFFECT' AS check_label,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM import_grants
      WHERE grantees && ARRAY['public', 'anon', 'authenticated']::name[]
    )
     AND EXISTS (
       SELECT 1 FROM import_grants
       WHERE 'service_role' = ANY(grantees)
     ) THEN 'PASS'
    WHEN NOT EXISTS (SELECT 1 FROM import_grants) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT string_agg(proname || '(' || args || ') -> ' || array_to_string(grantees, ','), '; ')
     FROM import_grants),
    'no import RPC EXECUTE grants found via proacl'
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260726000000 — user_account_activation
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260726000000_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.user_account_activation') IS NOT NULL
     AND to_regprocedure('public.lookup_auth_user_id_by_email(text)') IS NOT NULL
     AND NOT has_function_privilege('anon', 'public.lookup_auth_user_id_by_email(text)', 'EXECUTE')
    THEN 'PASS'
    WHEN to_regclass('public.user_account_activation') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'user_account_activation table + lookup_auth_user_id_by_email (anon revoked)' AS detail;

-- ---------------------------------------------------------------------------
-- 20260727000000 — rpc_update_invoice_with_items
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260727000000_EFFECT' AS check_label,
  CASE
    WHEN to_regprocedure(
      'public.rpc_update_invoice_with_items(uuid,uuid,text,date,date,text,text,text,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)'
    ) IS NOT NULL THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_update_invoice_with_items'
    ) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT pg_get_function_identity_arguments(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_update_invoice_with_items'
     LIMIT 1),
    'function missing'
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260728000000 — rpc_create_invoice_with_items
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260728000000_EFFECT' AS check_label,
  CASE
    WHEN to_regprocedure(
      'public.rpc_create_invoice_with_items(uuid,uuid,text,date,date,text,text,text,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)'
    ) IS NOT NULL
     AND has_function_privilege(
       'authenticated',
       'public.rpc_create_invoice_with_items(uuid,uuid,text,date,date,text,text,text,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)',
       'EXECUTE'
     ) THEN 'PASS'
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_create_invoice_with_items'
    ) THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'rpc_create_invoice_with_items exists + authenticated EXECUTE' AS detail;

-- ---------------------------------------------------------------------------
-- 20260729000000 — financial views security_invoker + anon revoke
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260729000000_EFFECT' AS check_label,
  CASE
    WHEN (
      SELECT COUNT(*) FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'
        AND c.relname IN ('invoices_view', 'payments_view', 'invoice_risk_view', 'payment_eligible_clients', 'payments_orphans')
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(c.reloptions, ARRAY[]::text[])) opt
          WHERE opt = 'security_invoker=true'
        )
    ) = 5
     AND NOT has_table_privilege('anon', 'public.invoices_view', 'SELECT')
    THEN 'PASS'
    WHEN to_regclass('public.invoices_view') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  '5 financial views security_invoker=true; anon SELECT revoked on invoices_view' AS detail;

-- ---------------------------------------------------------------------------
-- 20260806120000 — business workspace plan check constraints
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260806120000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.workspace_plans'::regclass
        AND conname = 'workspace_plans_plan_check'
        AND pg_get_constraintdef(oid) ILIKE '%business%'
    )
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.workspace_subscriptions'::regclass
         AND conname = 'workspace_subscriptions_plan_check'
         AND pg_get_constraintdef(oid) ILIKE '%business%'
     ) THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'workspace_plans + workspace_subscriptions plan_check includes business' AS detail;

-- ---------------------------------------------------------------------------
-- 20260806200000 — rpc_change_workspace_plan_atomic
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260806200000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_change_workspace_plan_atomic'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  COALESCE(
    (SELECT 'service_role EXECUTE=' || has_function_privilege(
       'service_role',
       p.oid::regprocedure,
       'EXECUTE'
     )::text
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_change_workspace_plan_atomic'
     LIMIT 1),
    'function missing'
  ) AS detail;

-- ---------------------------------------------------------------------------
-- 20260808140000 — standalone trial entitlement
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260808140000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions'
        AND column_name = 'trial_consumed_at'
    )
     AND to_regclass('public.workspace_entitlement_usage') IS NOT NULL
     AND to_regclass('public.workspace_trial_lifecycle_events') IS NOT NULL
     AND to_regprocedure('public.rpc_increment_entitlement_usage(uuid,text,integer)') IS NOT NULL
    THEN 'PASS'
    WHEN to_regclass('public.workspace_entitlement_usage') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'trial_consumed_at + entitlement usage/trial lifecycle tables' AS detail;

-- ---------------------------------------------------------------------------
-- 20260808150000 — entitlement atomic enforcement
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260808150000_EFFECT' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
     AND to_regprocedure('public.rpc_try_consume_entitlement_usage(uuid,text,integer,uuid)') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'clients_enforce_entitlement_capacity' AND NOT tgisinternal
     )
     AND EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'invoices_enforce_trial_usage' AND NOT tgisinternal
     ) THEN 'PASS'
    WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
      THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'entitlement preflight RPCs + client/invoice enforcement triggers' AS detail;

-- ---------------------------------------------------------------------------
-- 20260808160000 — phase2 consistency (schema objects; import body may differ)
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260808160000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspaces'
        AND column_name = 'trial_consumed_at'
    )
     AND to_regclass('public.workspace_entitlement_reservations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'invoices_enforce_entitlement' AND NOT tgisinternal
     )
     AND to_regprocedure('public.import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL
    THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'workspaces.trial_consumed_at + reservations + invoices_enforce_entitlement trigger' AS detail;

-- Separate body check: stale 08160000 import vs fixed 10120000
SELECT
  'MIGRATION_20260808160000_IMPORT_BODY' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL'
    WHEN p.prosrc ILIKE '%internal_import_entitlement_preflight%'
     AND p.prosrc ILIKE '%workspace_entitlement_reservations%' THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'internal_import_invoices_grouped body markers (outstanding_amount = stale)' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'internal_import_invoices_grouped'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

-- ---------------------------------------------------------------------------
-- 20260809100000 — reminders.scheduled_at
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260809100000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reminders'
        AND column_name = 'scheduled_at' AND data_type = 'date'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'reminders.scheduled_at date column' AS detail;

-- ---------------------------------------------------------------------------
-- 20260810120000 — fix import_invoices_grouped integrity (KNOWN-GOOD)
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260810120000_EFFECT' AS check_label,
  CASE
    WHEN p.prosrc ILIKE '%outstanding_amount%' THEN 'FAIL'
    WHEN p.prosrc ILIKE '%DELETE FROM public.invoice_items WHERE invoice_id%'
     AND p.prosrc ILIKE '%internal_import_entitlement_preflight(p_workspace_id, 0, v_new_invoices)%'
     AND p.prosrc ILIKE '%RAISE EXCEPTION ''invoice_import_failed''%'
    THEN 'PASS'
    ELSE 'UNKNOWN'
  END AS result,
  'internal_import_invoices_grouped: no outstanding_amount; batch atomicity; net-new preflight' AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'internal_import_invoices_grouped'
  AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
LIMIT 1;

SELECT
  'MIGRATION_20260810120000_HISTORY' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260810120000'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'schema_migrations row for 20260810120000' AS detail;

-- ---------------------------------------------------------------------------
-- 20260812120000 — harden client import atomic
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260812120000_EFFECT' AS check_label,
  CASE
    WHEN to_regprocedure('public.internal_parse_client_import_payment_terms_days(jsonb)') IS NOT NULL
     AND to_regprocedure('public.internal_rpc_import_clients(uuid,jsonb,boolean)') IS NOT NULL
     AND (
       SELECT p.prosrc ILIKE '%internal_parse_client_import_payment_terms_days%'
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'internal_rpc_import_clients'
       LIMIT 1
     ) THEN 'PASS'
    WHEN to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL THEN 'UNKNOWN'
    ELSE 'FAIL'
  END AS result,
  'internal_rpc_import_clients + payment_terms parser helper' AS detail;

-- ---------------------------------------------------------------------------
-- 20260108 anomaly — remote-only vs local split files
-- ---------------------------------------------------------------------------
SELECT
  'MIGRATION_20260108_REMOTE_HISTORY' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260108'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'remote history row 20260108 (legacy combined migration)' AS detail;

SELECT
  'MIGRATION_20260108000000_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.invoices_view') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'invoices_view'
         AND column_name IN ('paid', 'outstanding', 'display_status')
     ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'invoices_view stabilized paid/outstanding/display_status (superseded by later view migrations)' AS detail;

SELECT
  'MIGRATION_20260108000001_EFFECT' AS check_label,
  CASE
    WHEN to_regclass('public.payment_eligible_clients') IS NOT NULL THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'payment_eligible_clients view exists' AS detail;

SELECT
  'MIGRATION_20260108_000000_EFFECT' AS check_label,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('rpc_import_clients', 'rpc_import_invoices', 'rpc_import_payments')
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  'canonical import RPCs exist (bodies superseded by 20260725100000+ entitlement stack)' AS detail;

-- ---------------------------------------------------------------------------
-- ROLLUP — blank-remote migrations from reconciliation list
-- ---------------------------------------------------------------------------
SELECT 'MIGRATION_RECONCILIATION_ROLLUP' AS section;

WITH checks(check_label, result) AS (
  VALUES
    ('MIGRATION_20260115000000_EFFECT', NULL::text),
    ('MIGRATION_20260119000000_EFFECT', NULL::text),
    ('MIGRATION_20260122000000_EFFECT', NULL::text),
    ('MIGRATION_20260622130000_EFFECT', NULL::text),
    ('MIGRATION_20260706000000_EFFECT', NULL::text),
    ('MIGRATION_20260721000000_EFFECT', NULL::text),
    ('MIGRATION_20260722000000_EFFECT', NULL::text),
    ('MIGRATION_20260723000000_EFFECT', NULL::text),
    ('MIGRATION_20260723010000_EFFECT', NULL::text),
    ('MIGRATION_20260725000000_EFFECT', NULL::text),
    ('MIGRATION_20260725100000_EFFECT', NULL::text),
    ('MIGRATION_20260726000000_EFFECT', NULL::text),
    ('MIGRATION_20260727000000_EFFECT', NULL::text),
    ('MIGRATION_20260728000000_EFFECT', NULL::text),
    ('MIGRATION_20260729000000_EFFECT', NULL::text),
    ('MIGRATION_20260806120000_EFFECT', NULL::text),
    ('MIGRATION_20260806200000_EFFECT', NULL::text),
    ('MIGRATION_20260808140000_EFFECT', NULL::text),
    ('MIGRATION_20260808150000_EFFECT', NULL::text),
    ('MIGRATION_20260808160000_EFFECT', NULL::text),
    ('MIGRATION_20260809100000_EFFECT', NULL::text),
    ('MIGRATION_20260812120000_EFFECT', NULL::text)
)
SELECT
  check_label,
  'RUN INDIVIDUAL CHECKS ABOVE — rollup populated after manual review' AS note
FROM checks
ORDER BY check_label;
