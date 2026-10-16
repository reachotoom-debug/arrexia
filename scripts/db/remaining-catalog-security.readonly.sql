-- UNRESOLVED catalog/security evidence only; no application RPC is invoked.
-- Supabase SQL Editor: submit the ENTIRE file once, export the complete JSON cell.
-- Requires an authorized catalog reader plus SELECT on migration history.
-- Permission/error/truncated output = INCOMPLETE, never a pass. No grants here.
-- Known missing migrations/claims and confirmed accounting facts are not retested
-- as findings. Inventory below provides remaining security/prerequisite evidence.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH RECURSIVE
names(name) AS (VALUES
  ('payments'), ('invoices'), ('invoice_items'), ('invoices_view'), ('payments_view'),
  ('clients'), ('workspaces'), ('workspace_members'), ('settings'), ('reminders'),
  ('reminder_rules'), ('reminder_templates'), ('reminder_delivery_claims')),
relations AS (
  SELECT c.* FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN names x ON x.name=c.relname WHERE n.nspname='public'
),
roots AS (
  SELECT p.oid FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND (
    (n.nspname='public' AND (p.proname ILIKE '%payment%' OR p.proname ILIKE '%invoice%'
      OR p.proname IN ('claim_reminder_delivery','workspace_business_date','is_workspace_member','gen_random_uuid')))
    OR (n.nspname='auth' AND p.proname IN ('uid','role'))
    OR p.proname='gen_random_uuid'
    OR p.oid IN (SELECT t.tgfoid FROM pg_catalog.pg_trigger t JOIN relations c ON c.oid=t.tgrelid)
  )
),
-- Catalog dependencies do not resolve dynamic SQL or all PL/pgSQL textual calls.
function_ids(oid) AS (
  SELECT oid FROM roots
  UNION
  SELECT d.refobjid FROM function_ids f JOIN pg_catalog.pg_depend d
    ON d.classid='pg_catalog.pg_proc'::regclass AND d.objid=f.oid
    AND d.refclassid='pg_catalog.pg_proc'::regclass
),
functions AS (
  SELECT p.*, n.nspname FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN function_ids f ON f.oid=p.oid WHERE p.prokind='f'
),
api_roles AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
review_roles AS (
  SELECT r.* FROM pg_catalog.pg_roles r WHERE r.oid IN (
    SELECT oid FROM api_roles UNION SELECT proowner FROM functions UNION SELECT relowner FROM relations
    UNION SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname IN ('public','auth')
  )
),
checks(label,evidence) AS (
  SELECT 'U01_reader_completeness_and_role_trust', jsonb_build_object(
    'reader_is_superuser',(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user),
    'missing_api_roles',COALESCE((SELECT jsonb_agg(x.name ORDER BY x.name)
      FROM (VALUES ('anon'),('authenticated'),('service_role')) x(name)
      WHERE NOT EXISTS (SELECT 1 FROM api_roles r WHERE r.rolname=x.name)),'[]'::jsonb),
    'role_attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',rolname,
      'superuser',rolsuper,'bypass_rls',rolbypassrls,'login',rolcanlogin,'inherit',rolinherit)
      ORDER BY rolname) FROM review_roles),'[]'::jsonb),
    'role_membership_edges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'role',pg_catalog.pg_get_userbyid(m.roleid),'member',pg_catalog.pg_get_userbyid(m.member),
      'grantor',pg_catalog.pg_get_userbyid(m.grantor),'admin_option',m.admin_option)
      ORDER BY m.roleid,m.member) FROM pg_catalog.pg_auth_members m),'[]'::jsonb),
    'schema_trust',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,
      'owner',pg_catalog.pg_get_userbyid(n.nspowner),'acl',n.nspacl,
      'role',r.rolname,'usage',pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE'),
      'create',pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE')) ORDER BY n.nspname,r.rolname)
      FROM pg_catalog.pg_namespace n CROSS JOIN review_roles r WHERE n.nspname IN ('public','auth')),'[]'::jsonb))
  UNION ALL
  SELECT 'U02_function_security_and_definition_identity', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('schema',f.nspname,'name',f.proname,
      'signature',pg_catalog.pg_get_function_identity_arguments(f.oid),
      'result',pg_catalog.pg_get_function_result(f.oid),'owner',pg_catalog.pg_get_userbyid(f.proowner),
      'security_definer',f.prosecdef,'settings',f.proconfig,'acl',f.proacl,
      'definition_md5',md5(pg_catalog.pg_get_functiondef(f.oid)),
      'execute_roles',(SELECT jsonb_object_agg(r.rolname,pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')) FROM api_roles r),
      'expanded_acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
        'grantor',pg_catalog.pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
        ORDER BY a.grantee,a.privilege_type) FROM pg_catalog.aclexplode(COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) a),
      -- Existing captured RPC bodies need identity/security comparison, not another dump.
      -- Unknown helpers/claim body need inspection, including source-role restrictions.
      'remaining_helper_definition',CASE WHEN f.proname IN (
        'rpc_create_payment_manual','rpc_update_payment_manual','rpc_unarchive_payment_manual',
        'rpc_import_payments','rpc_update_invoice_with_items','import_invoices_grouped','internal_import_invoices_grouped',
        'set_updated_at','trg_enforce_invoice_workspace','trg_invoices_enforce_entitlement')
        THEN NULL ELSE pg_catalog.pg_get_functiondef(f.oid) END
    ) ORDER BY f.nspname,f.proname,pg_catalog.pg_get_function_identity_arguments(f.oid)) FROM functions f),'[]'::jsonb)
  UNION ALL
  SELECT 'U03_relation_ownership_rls_and_effective_privileges', jsonb_build_object(
    'missing_relations',COALESCE((SELECT jsonb_agg(x.name ORDER BY x.name) FROM names x
      WHERE NOT EXISTS(SELECT 1 FROM relations c WHERE c.relname=x.name)),'[]'::jsonb),
    'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'kind',c.relkind,
      'owner',pg_catalog.pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'options',c.reloptions,'acl',c.relacl,
      'view_definition_md5',CASE WHEN c.relkind IN ('v','m') THEN md5(pg_catalog.pg_get_viewdef(c.oid,true)) END,
      'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
        'select',pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT'),
        'insert',pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT'),
        'update',pg_catalog.has_table_privilege(r.oid,c.oid,'UPDATE'),
        'delete',pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE'),
        'truncate',pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE'),
        'trigger',pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER')) ORDER BY r.rolname) FROM api_roles r)
    ) ORDER BY c.relname) FROM relations c),'[]'::jsonb),
    'policies',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname)
      FROM pg_catalog.pg_policies p JOIN names x ON x.name=p.tablename WHERE p.schemaname='public'),'[]'::jsonb))
  UNION ALL
  SELECT 'U04_column_types_defaults_nullability_and_write_bypasses', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'column',a.attname,
      'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'generated',a.attgenerated,'identity',a.attidentity,'default_or_expression',pg_catalog.pg_get_expr(d.adbin,d.adrelid),
      'column_acl',a.attacl,'write_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
        'insert',pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),
        'update',pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE')) ORDER BY r.rolname) FROM api_roles r)
    ) ORDER BY c.relname,a.attnum) FROM relations c
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE c.relkind IN ('r','p')),'[]'::jsonb)
  UNION ALL
  SELECT 'U05_constraints_indexes_and_delete_dependencies', jsonb_build_object(
    'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',k.conrelid::regclass::text,
      'referenced_table',CASE WHEN k.confrelid<>0 THEN k.confrelid::regclass::text END,
      'name',k.conname,'type',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,
      'initially_deferred',k.condeferred,'definition',pg_catalog.pg_get_constraintdef(k.oid,true))
      ORDER BY k.conrelid,k.conname) FROM pg_catalog.pg_constraint k
      WHERE k.conrelid IN (SELECT oid FROM relations) OR k.confrelid IN (SELECT oid FROM relations)),'[]'::jsonb),
    'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',ic.relname,
      'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,
      'definition',pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname,ic.relname)
      FROM pg_catalog.pg_index i JOIN relations c ON c.oid=i.indrelid
      JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid),'[]'::jsonb))
  UNION ALL
  SELECT 'U06_unreviewed_payment_triggers_internal_triggers_and_rules', jsonb_build_object(
    'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
      'internal',t.tgisinternal,'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid,true),
      'function',t.tgfoid::regprocedure::text,'function_owner',pg_catalog.pg_get_userbyid(p.proowner),
      'security_definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,
      'function_definition',pg_catalog.pg_get_functiondef(p.oid)) ORDER BY c.relname,t.tgname)
      FROM pg_catalog.pg_trigger t JOIN relations c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE c.relname='payments' OR t.tgisinternal),'[]'::jsonb),
    'rewrite_rules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.tablename,r.rulename)
      FROM pg_catalog.pg_rules r JOIN names x ON x.name=r.tablename
      WHERE r.schemaname='public' AND r.rulename<>'_RETURN'),'[]'::jsonb))
  UNION ALL
  SELECT 'U07_unreviewed_migration_ledger_identity', jsonb_build_object(
    'ledger_relation',to_regclass('supabase_migrations.schema_migrations')::text,
    'versions_and_names',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',m.version,'name',m.name) ORDER BY m.version)
      FROM supabase_migrations.schema_migrations m),'[]'::jsonb),
    'purpose','Compare deployment history/prerequisites and new guard version; prior absence of the two expected migrations is already confirmed. History alone does not prove definitions match.')
)
SELECT jsonb_build_object(
  'label','ARREXIA_REMAINING_CATALOG_SECURITY_V1',
  'review_state','EVIDENCE_ONLY_REQUIRES_REVIEW_NOT_A_GO_DECISION',
  'context',jsonb_build_object('database',current_database(),'reader',current_user,'session_user',session_user,
    'server_version',current_setting('server_version'),'captured_at',transaction_timestamp(),
    'snapshot',pg_current_snapshot()::text,'read_only',current_setting('transaction_read_only'),
    'isolation',current_setting('transaction_isolation')),
  'limitations',jsonb_build_array(
    'No RPC invocation, real send, payment mutation, migration or repair is tested.',
    'Catalog dependency discovery cannot prove all dynamic/textual helper calls were discovered; inspect helper bodies recursively.',
    'Missing/invisible objects or incomplete/truncated output are unresolved, never evidence of safety.',
    'Owner/role identity, inherited privileges and SQL Editor authority require operator review.',
    'Catalogs cannot prove old deployments drained, queues stopped, provider outcomes reconciled or backups restorable.'),
  'unresolved_checks',(SELECT jsonb_object_agg(label,evidence ORDER BY label) FROM checks)
) AS arrexia_remaining_catalog_security;
ROLLBACK;
