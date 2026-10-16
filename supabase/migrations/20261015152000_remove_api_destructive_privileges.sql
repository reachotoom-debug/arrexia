-- LOCAL REVIEW CANDIDATE: explicit captured base-table scope, not ALL TABLES.
-- Application flows require no TRUNCATE or trigger DDL. RLS does not scope TRUNCATE.
-- Service-role privileges and default privileges are deliberately unchanged.
DO $security$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','invoices','invoice_items','payments','reminders',
    'reminder_rules','reminder_templates','settings','workspace_members','workspaces'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid=to_regclass('public.'||t) AND relkind='r') THEN
      RAISE EXCEPTION 'Captured base table missing or changed kind: %',t;
    END IF;
    EXECUTE format('REVOKE TRUNCATE, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF pg_catalog.has_table_privilege(r,'public.'||t,'TRUNCATE') OR pg_catalog.has_table_privilege(r,'public.'||t,'TRIGGER') THEN
        RAISE EXCEPTION 'Unexpected inherited destructive privilege: % %',r,t;
      END IF;
    END LOOP;
  END LOOP;
END;
$security$;
