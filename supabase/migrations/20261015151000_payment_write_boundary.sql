-- LOCAL REVIEW CANDIDATE. Apply after generated-net guard and workspace fences.
-- Requires the accompanying client cascade restore change before reopening writes.
-- Retain direct archive only. Financial edits/create/restore use existing RPCs.
DO $security$
DECLARE t text; columns text; r text; f regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.payments'::regclass
    AND polname='financial_workspace_member_fence' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'Payment workspace restrictive fence is a prerequisite';
  END IF;
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.rpc_create_payment_manual(uuid,uuid,uuid,numeric,date,text,text,text,text,text)'),
    to_regprocedure('public.rpc_update_payment_manual(uuid,uuid,uuid,uuid,numeric,date,text,text,text,text,text)'),
    to_regprocedure('public.rpc_unarchive_payment_manual(uuid,uuid)')
  ] LOOP
    IF f IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_class c ON c.oid='public.payments'::regclass
      WHERE p.oid=f AND p.prosecdef AND p.proowner=c.relowner AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'Expected owner-executed authenticated guarded payment RPC: %',f;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['payments','payments_view','invoices_view'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated',t);
    -- Table REVOKE alone does not remove previously granted column privileges.
    SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO columns
      FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%1$s), UPDATE (%1$s) ON public.%2$I FROM PUBLIC, anon, authenticated',columns,t);
  END LOOP;
  GRANT UPDATE (archived_at) ON public.payments TO authenticated;
  CREATE POLICY payments_direct_archive_only ON public.payments AS RESTRICTIVE FOR UPDATE TO anon, authenticated
    USING (true) WITH CHECK (archived_at IS NOT NULL);
  -- Owner/service execution bypasses this direct-caller fence. A restore must use
  -- rpc_unarchive_payment_manual; permitting direct NULL would bypass its guard.
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['payments','payments_view','invoices_view'] LOOP
      IF pg_catalog.has_table_privilege(r,'public.'||t,'INSERT') OR pg_catalog.has_table_privilege(r,'public.'||t,'UPDATE')
        OR pg_catalog.has_table_privilege(r,'public.'||t,'DELETE') OR pg_catalog.has_any_column_privilege(r,'public.'||t,'INSERT') THEN
        RAISE EXCEPTION 'Unexpected inherited/PUBLIC payment write privilege: % %',r,t;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass('public.'||t) AND a.attnum>0 AND NOT a.attisdropped
        AND NOT (r='authenticated' AND t='payments' AND a.attname='archived_at')
        AND pg_catalog.has_column_privilege(r,a.attrelid,a.attnum,'UPDATE')) THEN
        RAISE EXCEPTION 'Unexpected inherited/PUBLIC payment column UPDATE: % %',r,t;
      END IF;
    END LOOP;
  END LOOP;
END;
$security$;
