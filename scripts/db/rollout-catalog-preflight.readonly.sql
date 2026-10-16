-- Operator evidence collection only. SELECTs in a read-only transaction.
-- This file has NOT been executed against production: current access is REST-only.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database(), current_user, version(), transaction_timestamp(),
       current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation,
       pg_current_snapshot() AS snapshot;

SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT to_regprocedure('public.claim_reminder_delivery(uuid,uuid,uuid,date,date,text)') AS expected_claim_signature,
       to_regclass('public.reminder_delivery_claims') AS claim_table;
SELECT expected.version, (applied.version IS NOT NULL) AS recorded_applied, applied.name
FROM (VALUES ('20261015010000'), ('20261015120000')) AS expected(version)
LEFT JOIN supabase_migrations.schema_migrations applied ON applied.version = expected.version;

SELECT r.rolname, r.rolsuper, r.rolbypassrls, n.nspname, n.nspacl,
       has_schema_privilege(r.oid, n.oid, 'USAGE') AS schema_usage,
       has_schema_privilege(r.oid, n.oid, 'CREATE') AS schema_create
FROM pg_roles r CROSS JOIN pg_namespace n
WHERE r.rolname IN ('anon', 'authenticated', 'service_role') AND n.nspname = 'public';

SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.reloptions, pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('invoices_view', 'payments_view');

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig,
       p.proacl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'auth') AND p.proname IN (
  'import_invoices_grouped', 'internal_import_invoices_grouped',
  'claim_reminder_delivery', 'workspace_business_date', 'is_workspace_member',
  'rpc_create_payment_manual', 'rpc_update_payment_manual', 'rpc_unarchive_payment_manual',
  'rpc_import_payments', 'rpc_update_invoice_with_items', 'uid', 'role'
)
ORDER BY n.nspname, p.proname, signature;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS signature, r.rolname,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND (p.proname IN ('claim_reminder_delivery', 'import_invoices_grouped', 'internal_import_invoices_grouped', 'workspace_business_date', 'is_workspace_member')
       OR p.proname ILIKE '%payment%' OR p.proname ILIKE '%invoice%')
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY p.proname, signature, r.rolname;

SELECT table_name, column_name, data_type, numeric_precision, numeric_scale,
       is_nullable, column_default, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN (
  'payments', 'invoices', 'invoice_items', 'workspaces', 'settings',
  'reminder_rules', 'reminder_templates', 'reminder_delivery_claims'
)
ORDER BY table_name, ordinal_position;

-- Include enabled state and actual trigger function bodies, not just trigger names.
-- Trigger functions may live outside public and need not have a known name.
SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) AS definition,
       pn.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS function_signature,
       pg_get_userbyid(p.proowner) AS function_owner, p.prosecdef, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'public' AND c.relname IN ('payments', 'invoices', 'invoice_items')
  AND NOT t.tgisinternal;

-- pg_attribute/pg_attrdef independently expose generated versus ordinary/default
-- net columns; information_schema visibility alone can be privilege-limited.
SELECT n.nspname, c.relname, a.attname, a.attgenerated, a.attnotnull,
       format_type(a.atttypid, a.atttypmod) AS sql_type,
       pg_get_expr(d.adbin, d.adrelid) AS expression
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname = 'payments'
  AND a.attname IN ('amount', 'transaction_fee', 'net_amount')
  AND a.attnum > 0 AND NOT a.attisdropped;

-- Discover additional legacy/payment/invoice guards without assuming their names.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proname ILIKE '%payment%' OR p.proname ILIKE '%invoice%')
ORDER BY p.proname, signature;

SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relforcerowsecurity,
       r.rolname, has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public' AND c.relname IN ('reminder_delivery_claims', 'payments', 'invoices', 'invoice_items')
  AND r.rolname IN ('anon', 'authenticated', 'service_role');

-- Effective role checks above include PUBLIC/inherited grants. Expand ACLs too
-- so an accidental PUBLIC function grant is visible without invoking the RPC.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       pg_get_userbyid(a.grantor) AS grantor, a.privilege_type, a.is_grantable
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
WHERE n.nspname = 'public' AND (p.proname = 'claim_reminder_delivery'
  OR p.proname ILIKE '%payment%' OR p.proname ILIKE '%invoice%');

SELECT * FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('reminder_delivery_claims', 'payments', 'invoices', 'invoice_items');
SELECT r.rolname, c.relname, a.attname,
       has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') AS can_update_column
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN pg_roles r
WHERE n.nspname = 'public' AND c.relname = 'payments'
  AND a.attname IN ('amount', 'transaction_fee', 'net_amount', 'status', 'archived_at', 'invoice_id', 'workspace_id')
  AND r.rolname IN ('anon', 'authenticated', 'service_role');
SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolinherit
FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role') OR r.oid IN (
  SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND (p.proname = 'claim_reminder_delivery'
    OR p.proname ILIKE '%payment%' OR p.proname ILIKE '%invoice%')
);
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'reminder_delivery_claims';
SELECT c.relname AS index_name, i.indisvalid, i.indisready, i.indisunique
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = to_regclass('public.reminder_delivery_claims');
-- Include referencing foreign keys: physical DELETE and cascades are separate
-- from application archive (UPDATE archived_at) and require their own review.
SELECT conrelid::regclass AS on_table, confrelid::regclass AS referenced_table,
       conname, contype, convalidated, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid IN (to_regclass('public.reminder_delivery_claims'), to_regclass('public.payments'),
  to_regclass('public.invoices'), to_regclass('public.invoice_items'))
  OR confrelid = to_regclass('public.payments');
SELECT schemaname, tablename, rulename, definition FROM pg_rules
WHERE schemaname = 'public' AND tablename IN ('payments', 'invoices', 'invoice_items');
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_userbyid(p.proowner) AS owner, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'gen_random_uuid';
ROLLBACK;
