-- LOCAL REVIEW CANDIDATE. The supplemental organization catalog confirms broad
-- API grants plus self-INSERT/UPDATE users policies and member-UPDATE org policy.
-- Public users is authorization data, not the application's profiles table.
-- Bootstrap inserts organizations with service_role; profile flows use profiles.
-- Preserve SELECT, all existing policies, service grants and every existing row.
-- One atomic statement: inherited/PUBLIC privileges or missing service access
-- abort all changes. Default privileges for future objects remain out of scope.
DO $security$
DECLARE
  t text;
  r text;
  privilege_name text;
  column_names text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Expected existing service_role BYPASSRLS for bootstrap';
  END IF;

  -- Check both targets and required service operations before changing grants.
  FOREACH t IN ARRAY ARRAY['users','organizations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid=to_regclass('public.'||t) AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(c.relowner)='postgres') THEN
      RAISE EXCEPTION 'Expected captured postgres-owned RLS base table public.%',t;
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'] LOOP
      IF NOT pg_catalog.has_table_privilege('service_role','public.'||t,privilege_name) THEN
        RAISE EXCEPTION 'Missing existing service_role % privilege on public.%',privilege_name,t;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['users','organizations'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',t);
    -- Table-level REVOKE does not clear independently granted column writes.
    SELECT string_agg(format('%I',a.attname),', ' ORDER BY a.attnum) INTO column_names
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=to_regclass('public.'||t) AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('REVOKE INSERT (%1$s), UPDATE (%1$s) ON public.%2$I FROM PUBLIC, anon, authenticated',column_names,t);

    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege(r,'public.'||t,privilege_name) THEN
          RAISE EXCEPTION 'Unexpected inherited/PUBLIC identity write privilege: % % %',r,t,privilege_name;
        END IF;
      END LOOP;
      IF pg_catalog.has_any_column_privilege(r,'public.'||t,'INSERT')
        OR pg_catalog.has_any_column_privilege(r,'public.'||t,'UPDATE') THEN
        RAISE EXCEPTION 'Unexpected inherited/PUBLIC identity column write privilege: % %',r,t;
      END IF;
    END LOOP;
    -- Also catches a future role hierarchy in which service access depended on
    -- an API/PUBLIC grant rather than the captured independent service grant.
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER'] LOOP
      IF NOT pg_catalog.has_table_privilege('service_role','public.'||t,privilege_name) THEN
        RAISE EXCEPTION 'Service privilege changed: % public.%',privilege_name,t;
      END IF;
    END LOOP;
  END LOOP;
END;
$security$;
