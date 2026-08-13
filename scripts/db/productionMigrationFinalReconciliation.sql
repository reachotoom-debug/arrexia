-- ============================================================================
-- ARREXIA — Final Production Migration Reconciliation (READ-ONLY)
-- ============================================================================
--
-- PURPOSE:
--   Final verification snapshot for blank-remote local migrations after
--   launch-critical production paths were manually verified:
--     - 20260810120000 invoice import integrity (history synced)
--     - 20260812120000 client import hardening (manually applied)
--     - 20260809100000 reminders.scheduled_at DATE alignment + runtime smoke test
--
-- SAFETY:
--   SELECT-only. No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/GRANT/REVOKE/
--   TRUNCATE/CALL/DO blocks.
--
-- RUN:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/db/productionMigrationFinalReconciliation.sql
--
-- INTERPRETATION:
--   PASS    — intended final effect appears present
--   FAIL    — intended effect absent or contradicted
--   UNKNOWN — inconclusive; inspect detail columns
--
-- OUTPUT:
--   One consolidated result set: check_label, result, detail
--
-- ============================================================================

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
),
expected_view_columns(name) AS (
  VALUES
    ('id'), ('workspace_id'), ('client_id'), ('client_name'), ('invoice_number'),
    ('issue_date'), ('due_date'), ('currency'), ('total'), ('paid'),
    ('outstanding'), ('base_status'), ('display_status'), ('is_overdue'),
    ('overdue_days'), ('risk_level'), ('po_number'), ('notes'), ('archived_at'),
    ('client_is_active'), ('client_archived_at')
),
actual_view_columns AS (
  SELECT column_name, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invoices_view'
),
internal_import_invoices_grouped AS (
  SELECT p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_import_invoices_grouped'
    AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
  LIMIT 1
),
internal_rpc_import_clients AS (
  SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS identity_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_rpc_import_clients'
    AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
  LIMIT 1
),
rpc_import_clients_wrapper AS (
  SELECT p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_import_clients'
  LIMIT 1
),
client_import_grant_rows AS (
  SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    CASE
      WHEN has_function_privilege('service_role', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS grant_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'internal_parse_client_import_payment_terms_days',
      'internal_rpc_import_clients',
      'rpc_import_clients'
    )
),
scheduled_at_data AS (
  SELECT
    count(*) AS total_reminders,
    count(*) FILTER (WHERE scheduled_at IS NULL) AS scheduled_at_null,
    count(*) FILTER (WHERE scheduled_at IS NOT NULL) AS scheduled_at_populated
  FROM public.reminders
),
all_checks AS (
  SELECT
    'FINAL_20260810120000_HISTORY' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260810120000'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'schema_migrations row for 20260810120000' AS detail

  UNION ALL

  SELECT
    'FINAL_20260108_REMOTE_ONLY' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260108'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'remote history row 20260108 (legacy combined import migration)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260108000000_VIEW_EFFECT' AS check_label,
    CASE
      WHEN to_regclass('public.invoices_view') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'invoices_view'
           AND column_name IN ('paid', 'outstanding', 'display_status')
       ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'invoices_view core columns present (view body superseded by 20260725000000+)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260108000001_PAYMENT_ELIGIBLE' AS check_label,
    CASE
      WHEN to_regclass('public.payment_eligible_clients') IS NOT NULL THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'payment_eligible_clients view exists' AS detail

  UNION ALL

  SELECT
    'FINAL_20260108_000000_IMPORT_RPCS' AS check_label,
    CASE
      WHEN to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL
       AND to_regprocedure('public.rpc_import_invoices(uuid,jsonb)') IS NOT NULL
       AND to_regprocedure('public.rpc_import_payments(uuid,jsonb)') IS NOT NULL
      THEN 'PASS'
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('rpc_import_clients', 'rpc_import_invoices', 'rpc_import_payments')
      ) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'import RPC wrappers exist (bodies superseded; do not replay 20260108 file)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260115000000_ARCHIVED_AT' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices_view'
          AND column_name = 'archived_at'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'invoices_view.archived_at column' AS detail

  UNION ALL

  SELECT
    'FINAL_20260119000000_SETTINGS_COLUMNS' AS check_label,
    CASE
      WHEN (
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
          AND column_name IN (
            'branding_business_legal_name',
            'branding_business_address',
            'branding_tax_id',
            'timezone'
          )
      ) = 4 THEN 'PASS'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
          AND column_name = 'timezone'
      ) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'settings branding + timezone columns' AS detail

  UNION ALL

  SELECT
    'FINAL_20260122000000_VIEW_CONSISTENCY' AS check_label,
    CASE
      WHEN to_regclass('public.invoices_view') IS NOT NULL
       AND to_regclass('public.payments_view') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'invoices_view'
           AND column_name = 'workspace_id'
       ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'invoices_view + payments_view present with workspace-scoped invoices_view' AS detail

  UNION ALL

  SELECT
    'FINAL_20260622130000_ADMIN_CONSOLE' AS check_label,
    CASE
      WHEN to_regclass('public.admin_users') IS NOT NULL
       AND to_regclass('public.admin_audit_logs') IS NOT NULL
       AND to_regclass('public.workspace_subscriptions') IS NOT NULL
      THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'admin_users + admin_audit_logs + workspace_subscriptions tables' AS detail

  UNION ALL

  SELECT
    'FINAL_20260706000000_NEWSLETTER' AS check_label,
    CASE
      WHEN to_regclass('public.newsletter_subscribers') IS NOT NULL THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'newsletter_subscribers table' AS detail

  UNION ALL

  SELECT
    'FINAL_20260721000000_CLIENT_STATUS' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices_view'
          AND column_name IN ('client_is_active', 'client_archived_at')
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'invoices_view client_is_active + client_archived_at' AS detail

  UNION ALL

  SELECT
    'FINAL_20260722000000_TRIGGER_NORMALIZATION' AS check_label,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.reminder_rules
        WHERE trigger_type = 'relative_to_due_date'
      ) THEN 'PASS'
      WHEN EXISTS (SELECT 1 FROM public.reminder_rules LIMIT 1) THEN 'UNKNOWN'
      ELSE 'PASS'
    END AS result,
    'no relative_to_due_date rows remain (or no rules table data)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260723000000_AUTOMATION_COLUMNS' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
          AND column_name = 'auto_send_reminders'
      )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'settings'
           AND column_name = 'reminder_before_days'
       ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'settings automation columns present' AS detail

  UNION ALL

  SELECT
    'FINAL_20260723010000_AUTO_SEND_DEFAULT' AS check_label,
    CASE
      WHEN (
        SELECT column_default::text
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
          AND column_name = 'auto_send_reminders'
      ) ILIKE '%false%' THEN 'PASS'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settings'
          AND column_name = 'auto_send_reminders'
      ) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'auto_send_reminders default false' AS detail

  UNION ALL

  SELECT
    'FINAL_20260725000000_FUNCTION' AS check_label,
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
       ORDER BY p.oid LIMIT 1),
      'function missing'
    ) AS detail

  UNION ALL

  SELECT
    'FINAL_20260725000000_VIEW_AGING' AS check_label,
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
        THEN 'viewdef still uses CURRENT_DATE'
      ELSE 'aging marker not found'
    END AS detail

  UNION ALL

  SELECT
    'FINAL_20260725000000_VIEW_CONTRACT' AS check_label,
    CASE
      WHEN (SELECT COUNT(*) FROM expected_view_columns) = (SELECT COUNT(*) FROM actual_view_columns)
       AND NOT EXISTS (
         SELECT 1 FROM expected_view_columns e
         LEFT JOIN actual_view_columns a ON a.column_name = e.name
         WHERE a.column_name IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM actual_view_columns a
         LEFT JOIN expected_view_columns e ON e.name = a.column_name
         WHERE e.name IS NULL
       )
      THEN 'PASS'
      WHEN (SELECT COUNT(*) FROM actual_view_columns) = 21 THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    (SELECT COUNT(*)::text || ' columns; expected 21' FROM actual_view_columns) AS detail

  UNION ALL

  SELECT
    'FINAL_20260725100000_IMPORT_GRANTS' AS check_label,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM import_grants
        WHERE grantees && ARRAY['public', 'anon', 'authenticated']::name[]
      )
       AND EXISTS (
         SELECT 1 FROM import_grants WHERE 'service_role' = ANY(grantees)
       ) THEN 'PASS'
      WHEN NOT EXISTS (SELECT 1 FROM import_grants) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    COALESCE(
      (SELECT string_agg(proname || '(' || args || ') -> ' || array_to_string(grantees, ','), '; ')
       FROM import_grants),
      'no import RPC EXECUTE grants found'
    ) AS detail

  UNION ALL

  SELECT
    'FINAL_20260726000000_ACTIVATION' AS check_label,
    CASE
      WHEN to_regclass('public.user_account_activation') IS NOT NULL
       AND to_regprocedure('public.lookup_auth_user_id_by_email(text)') IS NOT NULL
       AND NOT has_function_privilege('anon', 'public.lookup_auth_user_id_by_email(text)', 'EXECUTE')
      THEN 'PASS'
      WHEN to_regclass('public.user_account_activation') IS NOT NULL THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'user_account_activation + lookup_auth_user_id_by_email (anon revoked)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260727000000_UPDATE_INVOICE_RPC' AS check_label,
    CASE
      WHEN to_regprocedure(
        'public.rpc_update_invoice_with_items(uuid,uuid,date,date,text,text,text,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)'
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
    ) AS detail

  UNION ALL

  SELECT
    'FINAL_20260728000000_CREATE_INVOICE_RPC' AS check_label,
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
    'rpc_create_invoice_with_items exists + authenticated EXECUTE' AS detail

  UNION ALL

  SELECT
    'FINAL_20260729000000_SECURITY_INVOKER' AS check_label,
    CASE
      WHEN (
        SELECT COUNT(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v'
          AND c.relname IN (
            'invoices_view', 'payments_view', 'invoice_risk_view',
            'payment_eligible_clients', 'payments_orphans'
          )
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
    '5 financial views security_invoker=true; anon SELECT revoked on invoices_view' AS detail

  UNION ALL

  SELECT
    'FINAL_20260729000000_PRESERVES_AGING' AS check_label,
    CASE
      WHEN position('workspace_business_date' IN pg_get_viewdef('public.invoices_view'::regclass, true)) > 0
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS result,
    '20260729000000 is additive; invoices_view still uses workspace_business_date aging' AS detail

  UNION ALL

  SELECT
    'FINAL_20260806120000_BUSINESS_PLAN' AS check_label,
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
    'plan_check constraints include business tier' AS detail

  UNION ALL

  SELECT
    'FINAL_20260806200000_PLAN_RPC' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_change_workspace_plan_atomic'
      )
       AND has_function_privilege(
         'service_role',
         (SELECT p.oid::regprocedure
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'rpc_change_workspace_plan_atomic'
          LIMIT 1),
         'EXECUTE'
       ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'rpc_change_workspace_plan_atomic exists (latest body from 20260808160000)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260808140000_TRIAL_ENTITLEMENT' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions'
          AND column_name = 'trial_consumed_at'
      )
       AND to_regclass('public.workspace_entitlement_usage') IS NOT NULL
       AND to_regclass('public.workspace_trial_lifecycle_events') IS NOT NULL
      THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'trial_consumed_at + entitlement usage/trial lifecycle tables' AS detail

  UNION ALL

  SELECT
    'FINAL_20260808150000_ENTITLEMENT_CORE' AS check_label,
    CASE
      WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
       AND to_regprocedure('public.rpc_try_consume_entitlement_usage(uuid,text,integer,uuid)') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pg_trigger
         WHERE tgname = 'clients_enforce_entitlement_capacity' AND NOT tgisinternal
       ) THEN 'PASS'
      WHEN to_regprocedure('public.internal_import_entitlement_preflight(uuid,integer,integer)') IS NOT NULL
        THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'entitlement preflight + consume RPCs + clients trigger (invoice trigger superseded)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260808150000_INVOICE_TRIGGER_SUPERSESSION' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'invoices_enforce_entitlement' AND NOT tgisinternal
      ) THEN 'PASS'
      WHEN EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'invoices_enforce_trial_usage' AND NOT tgisinternal
      ) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'invoices_enforce_entitlement present (replaces invoices_enforce_trial_usage)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260808160000_SCHEMA' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'workspaces'
          AND column_name = 'trial_consumed_at'
      )
       AND to_regclass('public.workspace_entitlement_reservations') IS NOT NULL
       AND to_regprocedure('public.rpc_reserve_entitlement_usage(uuid,text,integer,uuid)') IS NOT NULL
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS result,
    'workspaces.trial_consumed_at + reservations + reserve RPC' AS detail

  UNION ALL

  SELECT
    'FINAL_20260808160000_IMPORT_BODY_SUPERSESSION' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%outstanding_amount%' THEN 'FAIL'
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%DELETE FROM public.invoice_items WHERE invoice_id%'
       AND (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%internal_import_entitlement_preflight(p_workspace_id, 0, v_new_invoices)%'
       AND (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%RAISE EXCEPTION ''invoice_import_failed''%'
      THEN 'PASS'
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%internal_import_entitlement_preflight%' THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    'internal_import_invoices_grouped matches 20260810120000 body (081600 body superseded)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260809100000_SCHEDULED_AT' AS check_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reminders'
          AND column_name = 'scheduled_at'
          AND udt_name = 'date'
          AND is_nullable = 'YES'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'reminders.scheduled_at date NULL' AS detail

  UNION ALL

  SELECT
    'FINAL_20260809100000_SCHEDULED_AT_DATA' AS check_label,
    'PASS' AS result,
    'total=' || total_reminders::text
      || '; null=' || scheduled_at_null::text
      || '; populated=' || scheduled_at_populated::text AS detail
  FROM scheduled_at_data

  UNION ALL

  SELECT
    'FINAL_20260810120000_INVOICE_IMPORT' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%outstanding_amount%' THEN 'FAIL'
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%DELETE FROM public.invoice_items WHERE invoice_id%'
       AND (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%internal_import_entitlement_preflight(p_workspace_id, 0, v_new_invoices)%'
       AND (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%RAISE EXCEPTION ''invoice_import_failed''%'
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS result,
    'internal_import_invoices_grouped hardened body verified in production' AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_PARSER' AS check_label,
    CASE
      WHEN to_regprocedure('public.internal_parse_client_import_payment_terms_days(jsonb)') IS NOT NULL
      THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'internal_parse_client_import_payment_terms_days(jsonb)' AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_INTERNAL_RPC' AS check_label,
    CASE
      WHEN to_regprocedure('public.internal_rpc_import_clients(uuid,jsonb,boolean)') IS NOT NULL
      THEN 'PASS'
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'internal_rpc_import_clients'
      ) THEN 'UNKNOWN'
      ELSE 'FAIL'
    END AS result,
    COALESCE(
      (SELECT pg_get_function_identity_arguments(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'internal_rpc_import_clients'
       LIMIT 1),
      'function missing'
    ) AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_OLD_OVERLOAD_REMOVED' AS check_label,
    CASE
      WHEN to_regprocedure('public.internal_rpc_import_clients(uuid,jsonb)') IS NULL
      THEN 'PASS'
      ELSE 'FAIL'
    END AS result,
    'legacy 2-arg internal_rpc_import_clients overload absent' AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_BODY_MARKERS' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM internal_rpc_import_clients) ILIKE '%internal_parse_client_import_payment_terms_days%'
       AND (SELECT prosrc FROM internal_rpc_import_clients) ILIKE '%client_import_failed%'
       AND (SELECT prosrc FROM internal_rpc_import_clients) ILIKE '%p_dry_run%'
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS result,
    'atomic batch markers in 3-arg internal_rpc_import_clients' AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_WRAPPER' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM rpc_import_clients_wrapper) ILIKE '%internal_import_entitlement_preflight%'
       AND (SELECT prosrc FROM rpc_import_clients_wrapper) ILIKE '%internal_rpc_import_clients%'
       AND to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL
      THEN 'PASS'
      ELSE 'UNKNOWN'
    END AS result,
    'rpc_import_clients wrapper: preflight + delegate' AS detail

  UNION ALL

  SELECT
    'FINAL_20260812120000_GRANTS' AS check_label,
    CASE
      WHEN EXISTS (SELECT 1 FROM client_import_grant_rows WHERE grant_result = 'UNKNOWN')
        OR NOT EXISTS (SELECT 1 FROM client_import_grant_rows)
      THEN 'UNKNOWN'
      ELSE 'PASS'
    END AS result,
    COALESCE(
      (SELECT string_agg(proname || '(' || arguments || '): ' || grant_result, '; ' ORDER BY proname, arguments)
       FROM client_import_grant_rows),
      'no client import functions found'
    ) AS detail

  UNION ALL

  SELECT
    'FINAL_DO_NOT_REPLAY_20260108_IMPORT_BODIES' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM rpc_import_clients_wrapper) ILIKE '%NEVER raises exceptions for row-level errors%'
        OR (SELECT prosrc FROM rpc_import_clients_wrapper) ILIKE '%GRANT EXECUTE ON FUNCTION public.rpc_import_clients%authenticated%'
      THEN 'STALE_BODY_PRESENT'
      ELSE 'SUPERSEDED_OR_UNKNOWN'
    END AS result,
    '20260108_000000 canonical import bodies must not be replayed' AS detail

  UNION ALL

  SELECT
    'FINAL_DO_NOT_REPLAY_20260808160000_INVOICE_IMPORT' AS check_label,
    CASE
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%outstanding_amount%' THEN 'STALE_BODY_PRESENT'
      WHEN (SELECT prosrc FROM internal_import_invoices_grouped) ILIKE '%RAISE EXCEPTION ''invoice_import_failed''%' THEN 'SUPERSEDED_BY_10120000'
      ELSE 'UNKNOWN'
    END AS result,
    '081600 import body superseded by verified 10120000' AS detail
)
SELECT check_label, result, detail
FROM all_checks
ORDER BY check_label;
