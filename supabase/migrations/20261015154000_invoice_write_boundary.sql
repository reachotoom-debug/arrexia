-- LOCAL rollout candidate. No historical invoice changes.
-- Forms already create/edit header and items atomically through owner RPCs.
-- Keep archive/restore, collections notes and post-send draft promotion only.
DO $boundary$
DECLARE t text; cols text; r text; f regprocedure;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','invoice_items'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=to_regclass('public.'||t)
      AND polname='financial_workspace_member_fence' AND NOT polpermissive) THEN
      RAISE EXCEPTION 'Invoice workspace restrictive fence prerequisite missing: %',t;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.rpc_create_invoice_with_items(uuid,uuid,text,date,date,text,text,text,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)'),
    to_regprocedure('public.rpc_update_invoice_with_items(uuid,uuid,date,date,text,text,text,text,integer,numeric,numeric,numeric,numeric,numeric,numeric,jsonb)')
  ] LOOP
    IF f IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_class c ON c.oid='public.invoices'::regclass
      WHERE p.oid=f AND p.prosecdef AND p.proowner=c.relowner
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public']
      AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'Expected authorized owner-executed atomic invoice RPC: %',f;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['invoices','invoice_items','invoices_view'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated',t);
    SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO cols FROM pg_catalog.pg_attribute
      WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%1$s), UPDATE (%1$s) ON public.%2$I FROM PUBLIC, anon, authenticated',cols,t);
  END LOOP;
  GRANT UPDATE (archived_at,notes,status) ON public.invoices TO authenticated;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['invoices','invoice_items','invoices_view'] LOOP
      IF pg_catalog.has_table_privilege(r,'public.'||t,'INSERT')
        OR pg_catalog.has_table_privilege(r,'public.'||t,'UPDATE')
        OR pg_catalog.has_table_privilege(r,'public.'||t,'DELETE')
        OR pg_catalog.has_any_column_privilege(r,'public.'||t,'INSERT') THEN
        RAISE EXCEPTION 'Unexpected inherited/PUBLIC invoice write privilege: % %',r,t;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass('public.'||t)
        AND a.attnum>0 AND NOT a.attisdropped
        AND NOT (r='authenticated' AND t='invoices' AND a.attname IN ('archived_at','notes','status'))
        AND pg_catalog.has_column_privilege(r,a.attrelid,a.attnum,'UPDATE')) THEN
        RAISE EXCEPTION 'Unexpected inherited/PUBLIC invoice column UPDATE: % %',r,t;
      END IF;
    END LOOP;
  END LOOP;
-- SECURITY INVOKER deliberately tests the execution role, not JWT role text:
-- owner-executed edit RPCs and service operations retain existing behavior.
EXECUTE $definition$ CREATE FUNCTION public.enforce_invoice_direct_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
BEGIN
  IF current_user IN ('authenticated','anon') AND NEW.status IS DISTINCT FROM OLD.status
    AND (OLD.status='draft' AND NEW.status='sent' AND OLD.archived_at IS NULL AND NEW.archived_at IS NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied: invoice status changes require atomic invoice edit'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$guard$ $definition$;
REVOKE ALL ON FUNCTION public.enforce_invoice_direct_status_transition() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invoice_direct_status_transition BEFORE UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_direct_status_transition();
END;
$boundary$;
