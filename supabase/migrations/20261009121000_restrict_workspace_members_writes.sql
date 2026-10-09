-- Records security remediation already applied manually to production.
-- DO NOT reapply to production without reconciling migration history first.
-- Preserve membership rows and SELECT policies; provisioning remains server-only.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.workspace_members
  FROM PUBLIC, anon, authenticated;

-- Independent column grants survive a table-level REVOKE. Remove only write grants.
DO $$
DECLARE
  column_name text;
BEGIN
  FOR column_name IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.workspace_members'::regclass
      AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.workspace_members FROM PUBLIC, anon, authenticated',
      column_name, column_name
    );
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_members TO service_role;

DROP POLICY IF EXISTS "workspace_members insert own" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members update own" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members delete own" ON public.workspace_members;
DROP POLICY IF EXISTS workspace_members_insert_own ON public.workspace_members;
-- Repository baseline name: checks only user_id = auth.uid(), not owner approval.
DROP POLICY IF EXISTS workspace_members_insert_self ON public.workspace_members;
-- Preserve every SELECT policy, including space- and underscore-named variants.

DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.workspace_members'::regclass
      AND polcmd IN ('a', 'w', 'd', '*')
  ) THEN
    RAISE EXCEPTION 'Membership INSERT, UPDATE, DELETE or ALL policies remain; reconcile unexpected policy names';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(role_name, 'public.workspace_members', 'INSERT')
       OR has_any_column_privilege(role_name, 'public.workspace_members', 'UPDATE')
       OR has_table_privilege(role_name, 'public.workspace_members', 'DELETE') THEN
      RAISE EXCEPTION 'Inherited membership write access remains for %; inspect role membership/ownership', role_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.workspace_members', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.workspace_members', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.workspace_members', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.workspace_members', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.workspace_members', 'DELETE') THEN
    RAISE EXCEPTION 'Required membership read/provisioning privileges are missing';
  END IF;
END;
$$;
