-- Prepared for a separately authorized, READ-ONLY production preflight.
-- No credentials, email addresses, payload bodies, writes or reconciliation.
-- to_jsonb reads tolerate the provenance column being absent before migration.
BEGIN TRANSACTION READ ONLY;

SELECT version FROM supabase_migrations.schema_migrations
WHERE version >= '20260927000000' ORDER BY version;

SELECT payment_provider, status, plan, billing_interval,
       COALESCE(to_jsonb(s)->>'paddle_environment','unclassified') AS environment,
       count(*) AS workspaces
FROM public.workspace_subscriptions s
GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5;

-- Hashed references only: no customer details or raw provider identifiers.
SELECT substr(encode(sha256(convert_to(workspace_id::text,'UTF8')),'hex'),1,16) AS workspace_reference,
       plan, status, billing_interval,
       to_jsonb(s)->>'paddle_environment' AS environment
FROM public.workspace_subscriptions s WHERE payment_provider='paddle'
ORDER BY workspace_id;

SELECT count(*) AS conflicts
FROM public.workspace_subscriptions
WHERE payment_provider='paddle' AND provider_subscription_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

SELECT substr(encode(sha256(convert_to(workspace_id::text,'UTF8')),'hex'),1,16) AS workspace_reference,
       (provider_customer_id IS NULL OR btrim(provider_customer_id)='') AS missing_customer,
       (provider_subscription_id IS NULL OR btrim(provider_subscription_id)='') AS missing_subscription
FROM public.workspace_subscriptions WHERE payment_provider='paddle'
AND (nullif(btrim(provider_customer_id),'') IS NULL OR nullif(btrim(provider_subscription_id),'') IS NULL);

SELECT substr(encode(sha256(convert_to(s.workspace_id::text,'UTF8')),'hex'),1,16) AS workspace_reference,
       s.plan AS subscription_plan, p.plan AS projection_plan
FROM public.workspace_subscriptions s JOIN public.workspace_plans p USING(workspace_id)
WHERE s.plan IS DISTINCT FROM p.plan;

SELECT status, COALESCE(to_jsonb(e)->>'paddle_environment','unclassified') AS environment,
       count(*) AS events, min(occurred_at) AS oldest, max(occurred_at) AS newest
FROM public.paddle_webhook_events e GROUP BY 1,2 ORDER BY 1,2;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS signature
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('rpc_claim_paddle_webhook','rpc_apply_paddle_webhook','rpc_finish_paddle_webhook','internal_import_entitlement_state')
ORDER BY 1,2;

SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
('workspace_subscriptions','workspace_plans','paddle_webhook_events','paddle_subscription_bindings')
ORDER BY 1,ordinal_position;

SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema='public'
AND event_object_table IN ('workspace_subscriptions','workspace_plans') ORDER BY 1,2,4;
ROLLBACK;
