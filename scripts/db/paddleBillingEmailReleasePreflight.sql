-- Read-only pre-release catalog/count checks. No payloads, addresses or identifiers.
-- Execute manually only under the separately approved production read-only session.
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('server_version') AS server_version;
SELECT max(version) AS latest_recorded_migration
FROM supabase_migrations.schema_migrations;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260927120000','20261001120000') ORDER BY version;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='workspace_paid_lifecycle_events'
ORDER BY ordinal_position;
SELECT count(*) AS historical_paid_ledger_rows,
       count(*) FILTER (WHERE event_key='paid_subscription_activated') AS activation_rows,
       count(*) FILTER (WHERE event_key LIKE 'paid_subscription_renewed:%') AS renewal_rows
FROM public.workspace_paid_lifecycle_events;
SELECT p.proname, p.prosecdef,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'rpc_apply_paddle_webhook','internal_apply_paddle_webhook_core',
 'rpc_claim_paid_billing_email','rpc_prepare_paid_billing_email',
 'rpc_finish_paid_billing_email','rpc_enqueue_annual_billing_reminders',
 'internal_paid_reminder_eligible');
SELECT r.rolname,
 has_table_privilege(r.rolname,'public.workspace_paid_lifecycle_events','SELECT') AS can_select,
 has_table_privilege(r.rolname,'public.workspace_paid_lifecycle_events','INSERT') AS can_insert,
 has_table_privilege(r.rolname,'public.workspace_paid_lifecycle_events','UPDATE') AS can_update,
 has_table_privilege(r.rolname,'public.workspace_paid_lifecycle_events','TRUNCATE') AS can_truncate
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');
ROLLBACK;
