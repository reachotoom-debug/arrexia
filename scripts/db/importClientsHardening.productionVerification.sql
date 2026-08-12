-- ============================================================================
-- ARREXIA — Client Import V1 Production-Safe Verification Gate
-- ============================================================================
--
-- PURPOSE:
--   Execute proposed client-import RPC fixes against a REAL PostgreSQL database
--   without leaving ANY persistent changes.
--
-- SAFETY MODEL:
--   - Single transaction: BEGIN ... ROLLBACK
--   - No COMMIT anywhere in this file
--   - All fixtures use generated UUIDs + prefix __ARREXIA_CLIENT_IMPORT_VERIFY__
--   - No SELECT/UPDATE/DELETE against production customer workspaces
--   - CREATE OR REPLACE FUNCTION changes are rolled back with the transaction
--   - Session-local failure trigger is rolled back with the transaction
--
-- MIGRATION NOTE:
--   This script applies supabase/migrations/20260812120000_harden_client_import_atomic.sql
--   INSIDE the transaction via \i. You do NOT need to deploy the migration first.
--   ROLLBACK restores the prior production function definitions.
--
-- RUN (from repository root, DATABASE_URL must point at target database):
--   psql "%DATABASE_URL%" -v ON_ERROR_STOP=1 -f scripts/db/importClientsHardening.productionVerification.sql
--
-- FAILURE HANDLING:
--   With ON_ERROR_STOP=1, psql exits on first error. The open transaction is
--   ABORTED and nothing is committed. Either:
--     1) reconnect / close session (implicit ROLLBACK), OR
--     2) run: ROLLBACK;
--   No customer data is modified on failure.
--
-- SUCCESS OUTPUT MUST INCLUDE:
--   ARREXIA_CLIENT_IMPORT_VERIFICATION_PASS
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

\i supabase/migrations/20260812120000_harden_client_import_atomic.sql

-- Session-local failure injection trigger (rolled back with transaction)
CREATE OR REPLACE FUNCTION public.__arrexia_client_import_verify_fail_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name = '__ARREXIA_CLIENT_IMPORT_VERIFY__FAIL_RUNTIME__' THEN
    RAISE EXCEPTION '__ARREXIA_CLIENT_IMPORT_VERIFY__ forced insert failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER __arrexia_client_import_verify_fail_insert_trg
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.__arrexia_client_import_verify_fail_insert();

DO $$
DECLARE
  v_prefix constant text := '__ARREXIA_CLIENT_IMPORT_VERIFY__';
  v_org_id uuid := gen_random_uuid();
  v_ws_a uuid := gen_random_uuid();
  v_ws_b uuid := gen_random_uuid();
  v_ws_ent uuid := gen_random_uuid();
  v_rows jsonb;
  v_result jsonb;
  v_client_id uuid;
  v_count integer;
  v_i integer;
  -- Import RPC persists lower(trim(email)); fixture emails use the same canonical form.
  v_email text := lower(trim(v_prefix || '-client@verify.local'));
  v_wa text := '+962779600001';
  v_conflict_email text := lower(trim(v_prefix || '-conflict-email@verify.local'));
  v_conflict_wa text := '+962779600002';
  v_actual record;
  v_diag text := '';
BEGIN
  INSERT INTO public.organizations (id, name)
  VALUES (v_org_id, v_prefix || ' Org')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (id, name, organization_id)
  VALUES
    (v_ws_a, v_prefix || ' WS-A', v_org_id),
    (v_ws_b, v_prefix || ' WS-B', v_org_id),
    (v_ws_ent, v_prefix || ' WS-ENT', v_org_id);

  -- Entitlement state MUST exist before any client INSERT (production trigger enforces capacity).
  INSERT INTO public.workspace_plans (workspace_id, plan, invoice_limit_monthly, client_limit)
  VALUES
    (v_ws_a, 'business', NULL, NULL),
    (v_ws_b, 'business', NULL, NULL),
    (v_ws_ent, 'starter', NULL, 11);

  INSERT INTO public.workspace_subscriptions (
    workspace_id,
    status,
    plan,
    payment_provider,
    current_period_starts_at,
    current_period_ends_at
  )
  VALUES
    (v_ws_a, 'active', 'business', 'manual', now(), now() + interval '30 days'),
    (v_ws_b, 'active', 'business', 'manual', now(), now() + interval '30 days'),
    (v_ws_ent, 'active', 'starter', 'manual', now(), now() + interval '30 days');

  IF NOT EXISTS (
    SELECT 1
    FROM public.internal_import_entitlement_state(v_ws_a) s
    WHERE s.entitlement_state = 'paid' AND s.can_mutate IS TRUE AND s.client_limit IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED FIXTURE: workspace A is not active paid mutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.internal_import_entitlement_state(v_ws_b) s
    WHERE s.entitlement_state = 'paid' AND s.can_mutate IS TRUE
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED FIXTURE: workspace B is not active paid mutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.internal_import_entitlement_state(v_ws_ent) s
    WHERE s.entitlement_state = 'paid'
      AND s.can_mutate IS TRUE
      AND s.client_limit = 11
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED FIXTURE: entitlement workspace is not starter paid with client_limit=11';
  END IF;

  -- Seed 10 active clients on entitlement workspace (10/11 capacity used, 1 slot remaining).
  FOR v_i IN 1..10 LOOP
    INSERT INTO public.clients (workspace_id, organization_id, name, email, is_active, archived_at)
    VALUES (
      v_ws_ent,
      v_org_id,
      v_prefix || ' Ent Seed ' || v_i,
      lower(v_prefix || '-ent-' || v_i || '@verify.local'),
      true,
      NULL
    );
  END LOOP;

  -- Seed identity-conflict clients on workspace A (email client vs WhatsApp client).
  INSERT INTO public.clients (workspace_id, organization_id, name, email, whatsapp_phone, is_active, archived_at)
  VALUES
    (v_ws_a, v_org_id, v_prefix || ' Email Only', v_conflict_email, NULL, true, NULL),
    (v_ws_a, v_org_id, v_prefix || ' WA Only', NULL, v_conflict_wa, true, NULL);

  -- TEST_A — create one client with full field persistence
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'row-1',
      'action', 'insert',
      'name', v_prefix || ' Acme Ltd',
      'email', v_email,
      'phone', '+15551230001',
      'whatsapp_phone', v_wa,
      'company_name', 'Acme Co',
      'country', 'Jordan',
      'payment_terms', '45',
      'payment_terms_days', 45,
      'status', 'active'
    )
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF jsonb_array_length(v_result) <> 1 OR (v_result->0->>'status') <> 'ok' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A: %', v_result::text;
  END IF;
  IF (v_result->0->>'action') IS DISTINCT FROM 'insert' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A: expected action insert, got %', v_result->0->>'action';
  END IF;

  v_client_id := NULLIF(v_result->0->>'client_id', '')::uuid;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A: client_id missing from RPC response: %', v_result::text;
  END IF;

  SELECT *
  INTO v_actual
  FROM public.clients c
  WHERE c.id = v_client_id
    AND c.workspace_id = v_ws_a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A: client row missing for client_id % in workspace %', v_client_id, v_ws_a;
  END IF;

  IF v_actual.name IS DISTINCT FROM v_prefix || ' Acme Ltd' THEN
    v_diag := v_diag || format('name expected=%s actual=%s; ', v_prefix || ' Acme Ltd', v_actual.name);
  END IF;
  IF lower(trim(v_actual.email)) IS DISTINCT FROM v_email THEN
    v_diag := v_diag || format('email expected=%s actual=%s; ', v_email, v_actual.email);
  END IF;
  IF COALESCE(v_actual.company, v_actual.company_name) IS DISTINCT FROM 'Acme Co' THEN
    v_diag := v_diag || format(
      'company expected=Acme Co actual company=%s company_name=%s; ',
      v_actual.company,
      v_actual.company_name
    );
  END IF;
  IF v_actual.country IS DISTINCT FROM 'Jordan' THEN
    v_diag := v_diag || format('country expected=Jordan actual=%s; ', v_actual.country);
  END IF;
  IF v_actual.whatsapp IS DISTINCT FROM '+15551230001' THEN
    v_diag := v_diag || format('whatsapp expected=+15551230001 actual=%s; ', v_actual.whatsapp);
  END IF;
  IF v_actual.whatsapp_phone IS DISTINCT FROM v_wa THEN
    v_diag := v_diag || format('whatsapp_phone expected=%s actual=%s; ', v_wa, v_actual.whatsapp_phone);
  END IF;
  IF COALESCE(v_actual.payment_terms::text, '') <> '45' THEN
    v_diag := v_diag || format('payment_terms expected=45 actual=%s; ', v_actual.payment_terms);
  END IF;
  IF v_actual.payment_terms_days IS DISTINCT FROM 45 THEN
    v_diag := v_diag || format('payment_terms_days expected=45 actual=%s; ', v_actual.payment_terms_days);
  END IF;
  IF v_actual.status IS DISTINCT FROM 'active' THEN
    v_diag := v_diag || format('status expected=active actual=%s; ', v_actual.status);
  END IF;
  IF v_actual.is_active IS DISTINCT FROM true THEN
    v_diag := v_diag || format('is_active expected=true actual=%s; ', v_actual.is_active);
  END IF;
  IF v_actual.archived_at IS NOT NULL THEN
    v_diag := v_diag || format('archived_at expected=NULL actual=%s; ', v_actual.archived_at);
  END IF;

  IF v_diag <> '' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A: %', v_diag;
  END IF;
  RAISE NOTICE 'TEST_A_CREATE_ONE: PASS';

  -- TEST_B — create second client (multiple creates)
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'row-2',
      'action', 'insert',
      'name', v_prefix || ' Beta Inc',
      'email', v_prefix || '-beta@verify.local'
    )
  );
  PERFORM public.rpc_import_clients(v_ws_a, v_rows);
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a) < 4 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_B: expected at least 4 clients on workspace A';
  END IF;
  RAISE NOTICE 'TEST_B_CREATE_MULTIPLE: PASS';

  -- TEST_C — duplicate names allowed (same name, new email => insert)
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'dup-name',
      'action', 'insert',
      'name', v_prefix || ' Shared Name',
      'email', v_prefix || '-shared-a@verify.local'
    ),
    jsonb_build_object(
      'rowId', 'dup-name-2',
      'action', 'insert',
      'name', v_prefix || ' Shared Name',
      'email', v_prefix || '-shared-b@verify.local'
    )
  );
  PERFORM public.rpc_import_clients(v_ws_a, v_rows);
  IF (SELECT COUNT(*) FROM public.clients c WHERE c.workspace_id = v_ws_a AND c.name = v_prefix || ' Shared Name') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_C: duplicate names should create two clients';
  END IF;
  RAISE NOTICE 'TEST_C_DUPLICATE_NAMES_ALLOWED: PASS';

  -- TEST_D — update by email preserves omitted optional fields (reuse TEST_A client_id)
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'row-3',
      'action', 'update',
      'name', v_prefix || ' Acme Updated',
      'email', v_email
    )
  );
  PERFORM public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = v_client_id
      AND c.name = v_prefix || ' Acme Updated'
      AND c.country = 'Jordan'
      AND c.whatsapp_phone = v_wa
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_D: update by email / preserve fields failed';
  END IF;
  RAISE NOTICE 'TEST_D_UPDATE_BY_EMAIL: PASS';

  -- TEST_E — update by WhatsApp
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'row-4',
      'action', 'update',
      'name', v_prefix || ' Acme WA Updated',
      'whatsapp_phone', v_wa
    )
  );
  PERFORM public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = v_client_id AND c.name = v_prefix || ' Acme WA Updated'
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_E: update by WhatsApp failed';
  END IF;
  RAISE NOTICE 'TEST_E_UPDATE_BY_WHATSAPP: PASS';

  -- TEST_F — duplicate email in file rejected (zero writes)
  v_count := (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a);
  v_rows := jsonb_build_array(
    jsonb_build_object('rowId','d1','action','insert','name','Dup A','email', v_prefix || '-dup@verify.local'),
    jsonb_build_object('rowId','d2','action','insert','name','Dup B','email', v_prefix || '-dup@verify.local')
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF (v_result->0->>'status') <> 'failed' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F: expected batch failure for duplicate email';
  END IF;
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a) <> v_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F: duplicate-email batch should leave zero new rows';
  END IF;
  RAISE NOTICE 'TEST_F_DUPLICATE_EMAIL_IN_FILE: PASS';

  -- TEST_G — duplicate WhatsApp in file rejected (zero writes)
  v_rows := jsonb_build_array(
    jsonb_build_object('rowId','w1','action','insert','name','WA A','whatsapp_phone', v_prefix || '-wa-dup'),
    jsonb_build_object('rowId','w2','action','insert','name','WA B','whatsapp_phone', v_prefix || '-wa-dup')
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF (v_result->0->>'status') <> 'failed' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_G: expected batch failure for duplicate WhatsApp';
  END IF;
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a) <> v_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_G: duplicate-WhatsApp batch should leave zero new rows';
  END IF;
  RAISE NOTICE 'TEST_G_DUPLICATE_WHATSAPP_IN_FILE: PASS';

  -- TEST_H — email and WhatsApp resolve to different existing clients
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId', 'conflict-1',
      'action', 'insert',
      'name', v_prefix || ' Conflict Row',
      'email', v_conflict_email,
      'whatsapp_phone', v_conflict_wa
    )
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF (v_result->0->>'status') <> 'failed' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_H: expected identity conflict failure';
  END IF;
  RAISE NOTICE 'TEST_H_EMAIL_WHATSAPP_CONFLICT: PASS';

  -- TEST_I — archived client rejected
  INSERT INTO public.clients (workspace_id, organization_id, name, email, is_active, archived_at)
  VALUES (v_ws_a, v_org_id, v_prefix || ' Archived', lower(v_prefix || '-archived@verify.local'), false, NOW());

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId','arch-1','action','insert','name','Should Fail','email', v_prefix || '-archived@verify.local'
    )
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, false);
  IF (v_result->0->>'status') <> 'failed' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_I: expected archived rejection';
  END IF;
  RAISE NOTICE 'TEST_I_ARCHIVED_REJECT: PASS';

  -- TEST_J — dry_run zero writes
  v_count := (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a);
  v_rows := jsonb_build_array(
    jsonb_build_object('rowId','dry-1','action','insert','name','Dry Run Client','email', v_prefix || '-dry@verify.local')
  );
  v_result := public.internal_rpc_import_clients(v_ws_a, v_rows, true);
  IF (v_result->0->>'status') <> 'ok' THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_J: dry_run should succeed structurally';
  END IF;
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a) <> v_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_J: dry_run must perform zero writes';
  END IF;
  RAISE NOTICE 'TEST_J_DRY_RUN: PASS';

  -- TEST_K — runtime atomicity (second row forces trigger failure, zero net writes)
  v_count := (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a);
  v_rows := jsonb_build_array(
    jsonb_build_object('rowId','atom-1','action','insert','name', v_prefix || ' Atomic OK','email', v_prefix || '-atomic-ok@verify.local'),
    jsonb_build_object('rowId','atom-2','action','insert','name','__ARREXIA_CLIENT_IMPORT_VERIFY__FAIL_RUNTIME__','email', v_prefix || '-atomic-fail@verify.local')
  );
  BEGIN
    PERFORM public.internal_rpc_import_clients(v_ws_a, v_rows, false);
    RAISE EXCEPTION 'VERIFY_FAILED TEST_K: expected runtime batch failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forced insert failure%' AND SQLERRM NOT LIKE '%client_import_failed%' THEN
      RAISE EXCEPTION 'VERIFY_FAILED TEST_K: unexpected error: %', SQLERRM;
    END IF;
  END;
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_a) <> v_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_K: failed runtime batch changed client count';
  END IF;
  RAISE NOTICE 'TEST_K_RUNTIME_ATOMICITY: PASS';

  -- TEST_L — retry after failed batch succeeds cleanly
  v_rows := jsonb_build_array(
    jsonb_build_object('rowId','retry-1','action','insert','name', v_prefix || ' Retry Client','email', v_prefix || '-retry@verify.local')
  );
  v_result := public.rpc_import_clients(v_ws_a, v_rows);
  IF (v_result->0->>'status') <> 'ok'
     OR NOT EXISTS (
       SELECT 1 FROM public.clients
       WHERE workspace_id = v_ws_a
         AND lower(trim(email)) = lower(v_prefix || '-retry@verify.local')
     ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_L: retry after failed batch should succeed';
  END IF;
  RAISE NOTICE 'TEST_L_RETRY_AFTER_FAILURE: PASS';

  -- TEST_M — tenant isolation
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId','iso-1','action','insert','name', v_prefix || ' WS-B Client','email', v_prefix || '-b@verify.local'
    )
  );
  PERFORM public.internal_rpc_import_clients(v_ws_b, v_rows, false);
  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_ws_b
      AND lower(trim(email)) = lower(v_prefix || '-b@verify.local')
  ) AND EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_ws_a
      AND lower(trim(email)) = lower(v_prefix || '-b@verify.local')
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_M: client leaked across workspaces';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_ws_b
      AND lower(trim(email)) = lower(v_prefix || '-b@verify.local')
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_M: workspace B client missing';
  END IF;
  RAISE NOTICE 'TEST_M_TENANT_ISOLATION: PASS';

  -- TEST_N — response includes client_id
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'rowId','cid-1','action','insert','name', v_prefix || ' ID Check','email', v_prefix || '-idcheck@verify.local'
    )
  );
  v_result := public.internal_rpc_import_clients(v_ws_b, v_rows, false);
  IF (v_result->0->>'client_id') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_N: client_id missing from RPC response';
  END IF;
  RAISE NOTICE 'TEST_N_CLIENT_ID_RESPONSE: PASS';

  -- TEST_O — updates consume zero entitlement slots (10/11 -> still 10 after 10 updates)
  v_count := (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_ent AND archived_at IS NULL);
  v_rows := '[]'::jsonb;
  FOR v_i IN 1..10 LOOP
    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'rowId', 'upd-' || v_i,
        'action', 'update',
        'name', v_prefix || ' Ent Updated ' || v_i,
        'email', lower(v_prefix || '-ent-' || v_i || '@verify.local')
      )
    );
  END LOOP;
  PERFORM public.rpc_import_clients(v_ws_ent, v_rows);
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_ent AND archived_at IS NULL) <> v_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_O: updates should not change active client count';
  END IF;
  RAISE NOTICE 'TEST_O_UPDATES_ZERO_ENTITLEMENT: PASS';

  -- TEST_P — 10 updates + 2 creates with one remaining slot fails preflight
  v_rows := '[]'::jsonb;
  FOR v_i IN 1..10 LOOP
    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'rowId', 'blk-u-' || v_i,
        'action', 'update',
        'name', v_prefix || ' Ent Block U ' || v_i,
        'email', lower(v_prefix || '-ent-' || v_i || '@verify.local')
      )
    );
  END LOOP;
  v_rows := v_rows || jsonb_build_array(
    jsonb_build_object('rowId','blk-n1','action','insert','name', v_prefix || ' Block New 1','email', lower(v_prefix || '-ent-block1@verify.local')),
    jsonb_build_object('rowId','blk-n2','action','insert','name', v_prefix || ' Block New 2','email', lower(v_prefix || '-ent-block2@verify.local'))
  );
  BEGIN
    PERFORM public.rpc_import_clients(v_ws_ent, v_rows);
    RAISE EXCEPTION 'VERIFY_FAILED TEST_P: expected entitlement preflight failure for 2 net-new with 1 slot';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%client_limit_reached%' THEN
      RAISE EXCEPTION 'VERIFY_FAILED TEST_P: unexpected entitlement error: %', SQLERRM;
    END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_ws_ent
      AND lower(trim(email)) = lower(v_prefix || '-ent-block1@verify.local')
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_P: blocked batch still inserted client';
  END IF;
  RAISE NOTICE 'TEST_P_ENTITLEMENT_BLOCK_TWO_CREATES: PASS';

  -- TEST_Q — 10 updates + 1 create with one remaining slot succeeds
  v_rows := '[]'::jsonb;
  FOR v_i IN 1..10 LOOP
    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'rowId', 'ok-u-' || v_i,
        'action', 'update',
        'name', v_prefix || ' Ent OK U ' || v_i,
        'email', lower(v_prefix || '-ent-' || v_i || '@verify.local')
      )
    );
  END LOOP;
  v_rows := v_rows || jsonb_build_array(
    jsonb_build_object('rowId','ok-n1','action','insert','name', v_prefix || ' Ent OK New','email', lower(v_prefix || '-ent-oknew@verify.local'))
  );
  PERFORM public.rpc_import_clients(v_ws_ent, v_rows);
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_ws_ent
      AND lower(trim(email)) = lower(v_prefix || '-ent-oknew@verify.local')
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_Q: 10 updates + 1 create should succeed with one slot remaining';
  END IF;
  IF (SELECT COUNT(*) FROM public.clients WHERE workspace_id = v_ws_ent AND archived_at IS NULL) <> 11 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_Q: expected 11 active clients after successful entitlement batch';
  END IF;
  RAISE NOTICE 'TEST_Q_ENTITLEMENT_ALLOW_ONE_CREATE: PASS';

  RAISE NOTICE 'ARREXIA_CLIENT_IMPORT_VERIFICATION_PASS';
END $$;

ROLLBACK;
