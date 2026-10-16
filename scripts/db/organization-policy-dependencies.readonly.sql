-- Supplemental evidence only. Users/organizations were outside the supplied export.
-- Run the complete file in an authorized SQL Editor session; no approval inferred.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH targets AS (
  SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('users','organizations')
), org_access AS (
  SELECT DISTINCT w.id AS workspace_id,w.organization_id,u.auth_user_id
  FROM public.workspaces w JOIN public.users u ON u.organization_id=w.organization_id
  WHERE u.auth_user_id IS NOT NULL
), census AS (
  SELECT a.workspace_id,a.organization_id,count(*) AS organization_authorized_subjects,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id=a.workspace_id AND wm.user_id=a.auth_user_id)) AS organization_only_subjects
  FROM org_access a GROUP BY a.workspace_id,a.organization_id
)
SELECT jsonb_build_object(
  'label','ARREXIA_ORGANIZATION_POLICY_DEPENDENCIES_V1',
  'review_state','EVIDENCE_ONLY_NO_POLICY_REMOVAL_OR_DATA_CHANGE',
  'context',jsonb_build_object('reader',current_user,'database',current_database(),
    'snapshot',pg_current_snapshot()::text,'captured_at',transaction_timestamp(),
    'read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation')),
  'authorization_relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,
    'owner',pg_catalog.pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl,
    'roles',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'select',pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT'),
      'insert',pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT'),
      'update',pg_catalog.has_table_privilege(r.oid,c.oid,'UPDATE'),
      'delete',pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE'),
      'truncate',pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE'),
      'trigger',pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER')) ORDER BY r.rolname)
      FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'acl',a.attacl) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
  ) ORDER BY c.relname) FROM targets c),'[]'::jsonb),
  'authorization_policies',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname)
    FROM pg_catalog.pg_policies p WHERE p.schemaname='public' AND p.tablename IN ('users','organizations')),'[]'::jsonb),
  'organization_vs_workspace_subject_census',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.workspace_id) FROM census c),'[]'::jsonb),
  'legacy_reminders_without_workspace',(SELECT count(*) FROM public.reminders WHERE workspace_id IS NULL),
  'reminder_invoice_workspace_mismatch',(SELECT count(*) FROM public.reminders r JOIN public.invoices i ON i.id=r.invoice_id
    WHERE r.workspace_id IS DISTINCT FROM i.workspace_id),
  'item_invoice_organization_mismatch',(SELECT count(*) FROM public.invoice_items l JOIN public.invoices i ON i.id=l.invoice_id
    WHERE l.organization_id IS DISTINCT FROM i.organization_id),
  'membership_helpers',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
    'signature',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl,'definition',pg_catalog.pg_get_functiondef(p.oid))
    ORDER BY n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prokind='f' AND p.proname='is_workspace_member'),'[]'::jsonb),
  'default_privileges',COALESCE((SELECT jsonb_agg(jsonb_build_object('owner',pg_catalog.pg_get_userbyid(d.defaclrole),
    'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype)
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    WHERE d.defaclnamespace=0 OR n.nspname='public'),'[]'::jsonb),
  'limitations',jsonb_build_array('Counts establish present data shape, not intended organization authorization.',
    'A visibility/permission error or missing output is incomplete evidence, not zero exposure.',
    'Legacy policies are retained; workspace fences still change effective organization-only access.',
    'Do not alter owners, grants, roles, policies, memberships or rows during this read-only review.')
) AS organization_policy_dependencies;
ROLLBACK;
