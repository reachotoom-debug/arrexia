-- Read-only catalog and impact evidence; no secrets, contact details or raw provider IDs.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'latest_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'pending_migration_applied', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260927120000'),
  'columns', (SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type) ORDER BY table_name,ordinal_position)
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN
    ('workspace_subscriptions','workspace_plans','paddle_webhook_events','paddle_subscription_bindings')),
  'functions', (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),
    'security_definer',p.prosecdef,'acl',p.proacl::text,'definition_md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.proname,p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('rpc_claim_paddle_webhook','rpc_apply_paddle_webhook','rpc_finish_paddle_webhook','rpc_change_workspace_plan_atomic','internal_import_entitlement_state')),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('workspace_subscriptions','workspace_plans') AND NOT t.tgisinternal),
  'rls', (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname IN ('workspace_subscriptions','workspace_plans','paddle_webhook_events','paddle_subscription_bindings'))
) AS catalog;

SELECT jsonb_build_object(
  'subscription_cohorts', (SELECT jsonb_agg(to_jsonb(cohort)) FROM (
    SELECT payment_provider,status,plan,billing_interval,coalesce(to_jsonb(s)->>'paddle_environment','unclassified') AS environment,count(*)
    FROM public.workspace_subscriptions s GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5) cohort),
  'paddle_workspace_assessment', (SELECT jsonb_agg(jsonb_build_object(
    'workspace_reference',substr(encode(sha256(convert_to(workspace_id::text,'UTF8')),'hex'),1,16),
    'status',status,'plan',plan,'environment',to_jsonb(s)->>'paddle_environment',
    'missing_customer',nullif(btrim(provider_customer_id),'') IS NULL,
    'missing_subscription',nullif(btrim(provider_subscription_id),'') IS NULL,
    'missing_chronology',provider_last_event_at IS NULL)) FROM public.workspace_subscriptions s WHERE payment_provider='paddle'),
  'duplicate_provider_identities', (SELECT count(*) FROM (
    SELECT provider_subscription_id FROM public.workspace_subscriptions WHERE payment_provider='paddle'
    AND provider_subscription_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) d),
  'projection_mismatches', (SELECT jsonb_agg(to_jsonb(m)) FROM (
    SELECT s.payment_provider,s.status,s.plan AS subscription_plan,p.plan AS projection_plan,count(*)
    FROM public.workspace_subscriptions s JOIN public.workspace_plans p USING(workspace_id)
    WHERE s.plan IS DISTINCT FROM p.plan GROUP BY 1,2,3,4) m),
  'indexes', (SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname)
    FROM pg_indexes WHERE schemaname='public' AND tablename IN ('workspace_subscriptions','workspace_plans','paddle_webhook_events')),
  'grants', (SELECT jsonb_agg(jsonb_build_object('table',table_name,'role',grantee,'privilege',privilege_type) ORDER BY table_name,grantee,privilege_type)
    FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN
    ('workspace_subscriptions','workspace_plans','paddle_webhook_events','paddle_subscription_bindings') AND grantee IN ('anon','authenticated','service_role')),
  'policies', (SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check))
    FROM pg_policies WHERE schemaname='public' AND tablename IN ('workspace_subscriptions','workspace_plans','paddle_webhook_events','paddle_subscription_bindings'))
) AS impact;
ROLLBACK;
