-- LOCAL REVIEW CANDIDATE. No organization policy is removed or declared redundant.
-- Workspace membership is the application's boundary; organization-only access
-- changes require review of the supplemental organization census before rollout.
-- This entire DO statement is atomic, including policy DDL and prerequisite checks.
DO $security$
DECLARE t text; expected record; p pg_catalog.pg_policy%ROWTYPE;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','invoices','invoice_items','payments','reminders','reminder_rules','reminder_templates'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity) THEN
      RAISE EXCEPTION 'Expected enabled RLS on public.%',t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=to_regclass('public.'||t)
      AND polname=t||'_select_own_workspace' AND polcmd='r' AND polpermissive) THEN
      RAISE EXCEPTION 'Expected existing workspace SELECT policy on public.%',t;
    END IF;
  END LOOP;
  -- Refuse to silently remove a differently purposed policy after catalog drift.
  FOR expected IN SELECT * FROM (VALUES
    ('reminder_rules','dev_read_reminder_rules','r','true',NULL::text),
    ('reminder_templates','dev_read_reminder_templates','r','true',NULL::text),
    ('reminders','reminders_insert_authenticated','a',NULL::text,'true')
  ) AS x(table_name,policy_name,command,using_expr,check_expr) LOOP
    SELECT * INTO p FROM pg_catalog.pg_policy WHERE polrelid=to_regclass('public.'||expected.table_name) AND polname=expected.policy_name;
    IF NOT FOUND OR p.polcmd::text IS DISTINCT FROM expected.command OR NOT p.polpermissive
      OR p.polroles IS DISTINCT FROM ARRAY['authenticated'::regrole::oid]
      OR pg_catalog.pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM expected.using_expr
      OR pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) IS DISTINCT FROM expected.check_expr THEN
      RAISE EXCEPTION 'Unsafe-policy catalog drift: %.%',expected.table_name,expected.policy_name;
    END IF;
    EXECUTE format('DROP POLICY %I ON public.%I',expected.policy_name,expected.table_name);
  END LOOP;
  -- Restrictive predicates AND with the OR of existing permissive policies.
  -- Both old-row visibility and proposed-row membership must pass.
  FOREACH t IN ARRAY ARRAY['clients','invoices','payments','reminder_rules','reminder_templates'] LOOP
    EXECUTE format('CREATE POLICY financial_workspace_member_fence ON public.%1$I AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=%1$I.workspace_id AND wm.user_id=auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=%1$I.workspace_id AND wm.user_id=auth.uid()))',t);
  END LOOP;
  CREATE POLICY financial_workspace_member_fence ON public.invoice_items AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id=i.workspace_id
      WHERE i.id=invoice_items.invoice_id AND wm.user_id=auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id=i.workspace_id
      WHERE i.id=invoice_items.invoice_id AND wm.user_id=auth.uid()));
  CREATE POLICY financial_workspace_member_fence ON public.reminders AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id=i.workspace_id
      WHERE i.id=reminders.invoice_id AND i.workspace_id=reminders.workspace_id AND wm.user_id=auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i JOIN public.workspace_members wm ON wm.workspace_id=i.workspace_id
      WHERE i.id=reminders.invoice_id AND i.workspace_id=reminders.workspace_id AND wm.user_id=auth.uid()));
  -- Service role retains its grants/BYPASSRLS; owner-executed guarded RPCs retain
  -- their authorization checks. No grant is added and no row is modified here.
END;
$security$;
