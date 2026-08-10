-- ============================================================================
-- ARREXIA — Invoice Import P0 Production-Safe Verification Gate
-- ============================================================================
--
-- PURPOSE:
--   Execute proposed import RPC fixes against a REAL PostgreSQL database
--   without leaving ANY persistent changes.
--
-- SAFETY MODEL:
--   - Single transaction: BEGIN ... ROLLBACK
--   - No COMMIT anywhere in this file
--   - All fixtures use generated UUIDs + prefix __ARREXIA_IMPORT_P0_VERIFY__
--   - No SELECT/UPDATE/DELETE against production customer workspaces
--   - CREATE OR REPLACE FUNCTION changes are rolled back with the transaction
--   - Test trigger on invoice_items is rolled back with the transaction
--
-- RUN (from repository root, DATABASE_URL must point at target database):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/db/importInvoicesGroupedIntegrity.productionVerification.sql
--
-- FAILURE HANDLING:
--   With ON_ERROR_STOP=1, psql exits on first error. The open transaction is
--   ABORTED and nothing is committed. Either:
--     1) reconnect / close session (implicit ROLLBACK), OR
--     2) run: ROLLBACK;
--   No customer data is modified on failure.
--
-- SUCCESS OUTPUT MUST INCLUDE:
--   ARREXIA_IMPORT_P0_VERIFICATION_PASS
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- A. Apply proposed migration definitions inside this transaction
-- (copied from supabase/migrations/20260810120000_fix_import_invoices_grouped_integrity.sql)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
DECLARE
  v_errors jsonb := '[]'::jsonb;

  v_created_clients int := 0;
  v_created_invoices int := 0;
  v_created_items int := 0;

  v_row jsonb;
  v_rt text;
  v_inv text;

  v_client_id uuid;
  v_invoice_id uuid;
  v_existing_invoice_id uuid;

  v_invoice_ids jsonb := '{}'::jsonb;
  v_subtotal numeric;
  v_item_position integer;

  v_org_id uuid;
  v_has_org_id boolean;

  v_default_currency char(3) := 'USD';

  v_invoice_numbers_seen jsonb := '{}'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  SELECT organization_id INTO v_org_id
  FROM public.workspaces
  WHERE id = p_workspace_id
  LIMIT 1;

  IF v_has_org_id AND v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace is missing organization_id. Please contact support to configure your workspace.')
    );
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('p_rows must be a JSON array'));
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt NOT IN ('invoice','item') THEN
      v_errors := v_errors || jsonb_build_array(format('Invalid row_type "%s" (invoice_number=%s)', v_rt, v_inv));
      CONTINUE;
    END IF;

    IF v_inv = '' THEN
      v_errors := v_errors || jsonb_build_array('Missing invoice_number');
      CONTINUE;
    END IF;

    IF v_rt = 'invoice' THEN
      IF v_invoice_numbers_seen ? v_inv THEN
        v_errors := v_errors || jsonb_build_array(format('Duplicate invoice_number in file: %s', v_inv));
      ELSE
        v_invoice_numbers_seen := v_invoice_numbers_seen || jsonb_build_object(v_inv, 1);
      END IF;

      IF COALESCE(v_row->>'issue_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing issue_date for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'due_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing due_date for %s', v_inv));
      END IF;

      IF COALESCE(v_row->>'currency','') <> '' THEN
        DECLARE
          v_currency text := UPPER(TRIM(COALESCE(v_row->>'currency','')));
        BEGIN
          IF LENGTH(v_currency) <> 3 OR v_currency !~ '^[A-Z]{3}$' THEN
            v_errors := v_errors || jsonb_build_array(format('Invalid currency "%s" for %s (must be a 3-letter ISO code like USD, EUR, etc.)', v_row->>'currency', v_inv));
          END IF;
        END;
      END IF;

      IF LOWER(COALESCE(v_row->>'status','')) NOT IN ('draft','sent','void') THEN
        v_errors := v_errors || jsonb_build_array(format('Invalid status "%s" for %s (allowed Draft/Sent/Void)', COALESCE(v_row->>'status',''), v_inv));
      END IF;

      IF COALESCE(v_row->>'client_email','') = '' AND COALESCE(v_row->>'client_name','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing client_email or client_name for %s', v_inv));
      END IF;
    END IF;

    IF v_rt = 'item' THEN
      IF COALESCE(v_row->>'item_description','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing item_description for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'quantity','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing quantity for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'unit_price','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing unit_price for %s', v_inv));
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'errors', '[]'::jsonb,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'invoice' THEN
      v_client_id := NULL;

      IF COALESCE(v_row->>'client_email','') <> '' THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(email)) = LOWER(TRIM(v_row->>'client_email'))
        LIMIT 1;
      END IF;

      IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
        DECLARE
          v_client_count int;
        BEGIN
          SELECT COUNT(*) INTO v_client_count
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'));

          IF v_client_count = 0 THEN
            INSERT INTO public.clients (workspace_id, organization_id, name, email, is_active, archived_at)
            VALUES (
              p_workspace_id,
              CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
              TRIM(v_row->>'client_name'),
              NULLIF(TRIM(v_row->>'client_email'), ''),
              true,
              NULL
            )
            RETURNING id INTO v_client_id;
            v_created_clients := v_created_clients + 1;
          ELSIF v_client_count = 1 THEN
            SELECT id INTO v_client_id
            FROM public.clients
            WHERE workspace_id = p_workspace_id
              AND archived_at IS NULL
              AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'))
            LIMIT 1;
          ELSE
            v_errors := v_errors || jsonb_build_array(format('Multiple clients match name "%s" for %s. Use client_email or unique identifier.', v_row->>'client_name', v_inv));
            CONTINUE;
          END IF;
        END;
      END IF;

      IF v_client_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Client not found for %s', v_inv));
        CONTINUE;
      END IF;

      v_invoice_id := NULL;
      v_existing_invoice_id := NULL;

      SELECT id INTO v_existing_invoice_id
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = v_inv
        AND archived_at IS NULL
      LIMIT 1;

      IF v_existing_invoice_id IS NOT NULL THEN
        UPDATE public.invoices
        SET
          client_id = v_client_id,
          issue_date = (v_row->>'issue_date')::date,
          due_date = (v_row->>'due_date')::date,
          currency = COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
          status = LOWER(TRIM(v_row->>'status')),
          po_number = NULLIF(v_row->>'po_number',''),
          notes = NULLIF(v_row->>'notes',''),
          updated_at = NOW()
        WHERE id = v_existing_invoice_id
          AND workspace_id = p_workspace_id
        RETURNING id INTO v_invoice_id;
      ELSE
        IF EXISTS (
          SELECT 1
          FROM public.invoices i
          WHERE i.workspace_id = p_workspace_id
            AND i.invoice_number = v_inv
            AND i.archived_at IS NOT NULL
        ) THEN
          v_errors := v_errors || jsonb_build_array(format('Invoice is archived: %s', v_inv));
          CONTINUE;
        END IF;

        INSERT INTO public.invoices (
          workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
          amount
        )
        VALUES (
          p_workspace_id,
          CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
          v_client_id,
          v_inv,
          (v_row->>'issue_date')::date,
          (v_row->>'due_date')::date,
          COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
          LOWER(TRIM(v_row->>'status')),
          NULLIF(v_row->>'po_number',''),
          NULLIF(v_row->>'notes',''),
          0
        )
        RETURNING id INTO v_invoice_id;

        v_created_invoices := v_created_invoices + 1;
      END IF;

      IF v_invoice_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Failed to persist invoice header for %s', v_inv));
        CONTINUE;
      END IF;

      IF NOT (v_invoice_ids ? v_inv) THEN
        v_invoice_ids := v_invoice_ids || jsonb_build_object(v_inv, v_invoice_id::text);
      ELSE
        v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      END IF;
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'item' AND NOT (v_invoice_ids ? v_inv) THEN
      v_errors := v_errors || jsonb_build_array(format('Item row references invoice_number "%s" which does not exist in this file', v_inv));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'invoice_import_failed'
      USING ERRCODE = 'P0001',
            DETAIL = v_errors::text;
  END IF;

  FOR v_inv, v_invoice_id IN SELECT key, value FROM jsonb_each_text(v_invoice_ids)
  LOOP
    DELETE FROM public.invoice_items WHERE invoice_id = (v_invoice_id::uuid);
    v_item_position := 1;

    FOR v_row IN
      SELECT elem
      FROM jsonb_array_elements(p_rows) AS elem
      WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'item'
        AND COALESCE(elem->>'invoice_number', '') = v_inv
    LOOP
      IF v_has_org_id THEN
        INSERT INTO public.invoice_items (
          organization_id, invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          v_org_id,
          (v_invoice_id::uuid),
          TRIM(v_row->>'item_description'),
          NULL,
          (v_row->>'quantity')::numeric,
          (v_row->>'unit_price')::numeric,
          v_item_position
        );
      ELSE
        INSERT INTO public.invoice_items (
          invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          (v_invoice_id::uuid),
          TRIM(v_row->>'item_description'),
          NULL,
          (v_row->>'quantity')::numeric,
          (v_row->>'unit_price')::numeric,
          v_item_position
        );
      END IF;
      v_item_position := v_item_position + 1;
      v_created_items := v_created_items + 1;
    END LOOP;
  END LOOP;

  FOR v_inv, v_invoice_id IN SELECT key, value FROM jsonb_each_text(v_invoice_ids)
  LOOP
    SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_subtotal
    FROM public.invoice_items
    WHERE invoice_id = (v_invoice_id::uuid);

    UPDATE public.invoices
    SET amount = v_subtotal,
        updated_at = NOW()
    WHERE id = (v_invoice_id::uuid);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_invoices integer := 0;
BEGIN
  IF COALESCE(p_dry_run, true) IS NOT TRUE
     AND p_rows IS NOT NULL
     AND jsonb_typeof(p_rows) = 'array' THEN
    SELECT COUNT(*)::integer
    INTO v_new_invoices
    FROM jsonb_array_elements(p_rows) elem
    WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'invoice'
      AND NOT EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.workspace_id = p_workspace_id
          AND i.invoice_number = COALESCE(elem->>'invoice_number', '')
          AND i.archived_at IS NULL
      );

    PERFORM public.internal_import_entitlement_preflight(p_workspace_id, 0, v_new_invoices);
  END IF;

  RETURN public.internal_import_invoices_grouped(p_workspace_id, p_rows, p_dry_run);
END;
$$;

-- Session-local failure injection trigger (rolled back with transaction)
CREATE OR REPLACE FUNCTION public.__arrexia_import_p0_verify_fail_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.description = '__ARREXIA_IMPORT_P0_VERIFY__FAIL_ITEM__' THEN
    RAISE EXCEPTION '__ARREXIA_IMPORT_P0_VERIFY__ forced item insert failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER __arrexia_import_p0_verify_fail_item_insert_trg
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.__arrexia_import_p0_verify_fail_item_insert();

-- ============================================================================
-- B–J. Runtime assertions (isolated fixtures only)
-- ============================================================================

DO $$
DECLARE
  v_prefix constant text := '__ARREXIA_IMPORT_P0_VERIFY__';
  v_org_id uuid := gen_random_uuid();
  v_ws_a uuid := gen_random_uuid();
  v_ws_b uuid := gen_random_uuid();
  v_ws_trial uuid := gen_random_uuid();
  v_client_a uuid := gen_random_uuid();
  v_client_b uuid := gen_random_uuid();
  v_client_dup_a uuid := gen_random_uuid();
  v_client_dup_b uuid := gen_random_uuid();
  v_client_trial uuid := gen_random_uuid();
  v_invoice_id uuid;
  v_result jsonb;
  v_rows jsonb;
  v_item_count integer;
  v_amount numeric;
  v_total_paid numeric;
  v_outstanding numeric;
  v_invoice_count integer;
  v_net_new integer;
  v_item_detail text;
  v_expected_five_sum constant numeric := 550;
  v_inv_two text := v_prefix || '-TWO';
  v_inv_three text := v_prefix || '-THREE';
  v_inv_five text := v_prefix || '-FIVE';
  v_inv_replace text := v_prefix || '-REPLACE';
  v_inv_atomic_ok text := v_prefix || '-ATOMIC-OK';
  v_inv_atomic_fail text := v_prefix || '-ATOMIC-FAIL';
  v_inv_retry text := v_prefix || '-RETRY-OK';
  v_inv_pay text := v_prefix || '-PAY';
  v_inv_exist text := v_prefix || '-EXIST';
  v_inv_new1 text := v_prefix || '-NEW1';
  v_inv_new2 text := v_prefix || '-NEW2';
  v_inv_other text := v_prefix || '-OTHER-WS';
BEGIN
  -- Isolated fixtures only (never touch existing customer workspaces)
  INSERT INTO public.organizations (id, name)
  VALUES (v_org_id, v_prefix || ' Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_ws_a, v_org_id, v_prefix || ' Workspace A'),
    (v_ws_b, v_org_id, v_prefix || ' Workspace B'),
    (v_ws_trial, v_org_id, v_prefix || ' Trial Workspace');

  -- Entitlement state MUST exist before any client/invoice inserts (production triggers enforce this).
  -- General integrity workspaces: active paid Business (unlimited clients/invoices for import tests).
  INSERT INTO public.workspace_plans (workspace_id, plan, invoice_limit_monthly, client_limit)
  VALUES
    (v_ws_a, 'business', NULL, NULL),
    (v_ws_b, 'business', NULL, NULL),
    (v_ws_trial, 'free', 5, 5);

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
    (v_ws_b, 'active', 'business', 'manual', now(), now() + interval '30 days');

  -- Trial workspace: active standalone trial (canMutate=true) for net-new entitlement tests only.
  INSERT INTO public.workspace_subscriptions (
    workspace_id,
    status,
    plan,
    trial_starts_at,
    trial_ends_at,
    trial_consumed_at,
    payment_provider
  )
  VALUES (
    v_ws_trial,
    'trial',
    'starter',
    now(),
    now() + interval '14 days',
    now(),
    'manual'
  );

  INSERT INTO public.workspace_entitlement_usage (workspace_id, trial_invoices_created)
  VALUES (v_ws_trial, 73)
  ON CONFLICT (workspace_id) DO UPDATE
  SET trial_invoices_created = 73;

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_client_a, v_ws_a, v_org_id, v_prefix || ' Client A', v_prefix || '-client-a@verify.local', true),
    (v_client_b, v_ws_b, v_org_id, v_prefix || ' Client B', v_prefix || '-client-b@verify.local', true),
    (v_client_dup_a, v_ws_a, v_org_id, v_prefix || ' Dup Name', v_prefix || '-dup-a@verify.local', true),
    (v_client_dup_b, v_ws_a, v_org_id, v_prefix || ' Dup Name', v_prefix || '-dup-b@verify.local', true),
    (v_client_trial, v_ws_trial, v_org_id, v_prefix || ' Trial Client', v_prefix || '-trial@verify.local', true);

  -- Sanity: entitlement must be mutable before proceeding (mirrors production enforcement).
  IF NOT EXISTS (
    SELECT 1
    FROM public.internal_import_entitlement_state(v_ws_a) s
    WHERE s.entitlement_state = 'paid' AND s.can_mutate IS TRUE
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
    FROM public.internal_import_entitlement_state(v_ws_trial) s
    WHERE s.entitlement_state = 'trial' AND s.can_mutate IS TRUE
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED FIXTURE: trial workspace is not active trial mutable';
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST F — DRY RUN (invalid payload, zero writes)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_prefix || '-DRY-A','client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','invoice','invoice_number', v_prefix || '-DRY-A','client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent')
  );

  v_result := public.internal_import_invoices_grouped(v_ws_a, v_rows, true);
  IF COALESCE((v_result->>'ok')::boolean, true) IS TRUE THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F_DRY_RUN: expected validation failure, got ok=true';
  END IF;
  IF jsonb_array_length(COALESCE(v_result->'errors', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F_DRY_RUN: expected structured errors array';
  END IF;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_ws_a;
  IF v_invoice_count <> 0 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F_DRY_RUN: dry_run wrote % invoices', v_invoice_count;
  END IF;

  SELECT count(*) INTO v_item_count
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.workspace_id = v_ws_a;
  IF v_item_count <> 0 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_F_DRY_RUN: dry_run wrote % items', v_item_count;
  END IF;
  RAISE NOTICE 'TEST_F_DRY_RUN: PASS';

  -- --------------------------------------------------------------------------
  -- TEST A — TWO ITEMS (500 + 1500 = 2000)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_two,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_two,'item_description','Line 500','quantity','1','unit_price','500'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_two,'item_description','Line 1500','quantity','1','unit_price','1500')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices
  WHERE workspace_id = v_ws_a AND invoice_number = v_inv_two;

  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_item_count <> 2 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A_TWO_ITEMS: expected 2 items, got %', v_item_count;
  END IF;
  IF v_amount <> 2000 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_A_TWO_ITEMS: expected amount 2000, got %', v_amount;
  END IF;
  RAISE NOTICE 'TEST_A_TWO_ITEMS: PASS';

  -- --------------------------------------------------------------------------
  -- TEST B — THREE ITEMS (200 + 750 + 500 = 1450)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_three,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_three,'item_description','200','quantity','1','unit_price','200'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_three,'item_description','750','quantity','1','unit_price','750'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_three,'item_description','500','quantity','1','unit_price','500')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_three;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;

  IF v_item_count <> 3 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_B_THREE_ITEMS: expected 3 items, got %', v_item_count;
  END IF;
  IF v_amount <> 1450 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_B_THREE_ITEMS: expected amount 1450, got %', v_amount;
  END IF;
  RAISE NOTICE 'TEST_B_THREE_ITEMS: PASS';

  -- --------------------------------------------------------------------------
  -- TEST C — FIVE ITEMS (sum = 550: 10+40+90+160+250)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_five,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_five,'item_description','A','quantity','1','unit_price','10'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_five,'item_description','B','quantity','2','unit_price','20'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_five,'item_description','C','quantity','3','unit_price','30'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_five,'item_description','D','quantity','4','unit_price','40'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_five,'item_description','E','quantity','5','unit_price','50')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_five;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_amount FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  SELECT COALESCE(string_agg(
    format('%s qty=%s price=%s line=%s', name, quantity, unit_price, quantity * unit_price),
    '; ' ORDER BY position
  ), '(none)')
  INTO v_item_detail
  FROM public.invoice_items
  WHERE invoice_id = v_invoice_id;

  IF v_item_count <> 5 OR v_amount <> v_expected_five_sum THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_C_FIVE_ITEMS: expected items=5 sum=%, got items=% sum=% persisted=[%]',
      v_expected_five_sum, v_item_count, v_amount, v_item_detail;
  END IF;
  RAISE NOTICE 'TEST_C_FIVE_ITEMS: PASS';

  -- --------------------------------------------------------------------------
  -- TEST D — RE-IMPORT REPLACE (3 items -> 2 items, no duplicate header)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_replace,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_replace,'item_description','Old 1','quantity','1','unit_price','100'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_replace,'item_description','Old 2','quantity','1','unit_price','200'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_replace,'item_description','Old 3','quantity','1','unit_price','300')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_replace,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_replace,'item_description','New 1','quantity','1','unit_price','300'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_replace,'item_description','New 2','quantity','1','unit_price','100')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_replace;
  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_replace;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;

  IF v_invoice_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_D_REPLACE: expected 1 invoice header, got %', v_invoice_count;
  END IF;
  IF v_item_count <> 2 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_D_REPLACE: expected 2 items after replace, got %', v_item_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_items
    WHERE invoice_id = v_invoice_id AND name LIKE 'Old %'
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_D_REPLACE: old items were not removed';
  END IF;
  IF v_amount <> 400 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_D_REPLACE: expected amount 400, got %', v_amount;
  END IF;
  RAISE NOTICE 'TEST_D_REPLACE: PASS';

  -- --------------------------------------------------------------------------
  -- TEST H — PAYMENT PRESERVATION (payments are source of truth; outstanding is view-derived)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_pay,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_pay,'item_description','Paid line seed','quantity','1','unit_price','500')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT id INTO v_invoice_id FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_pay;

  INSERT INTO public.payments (
    workspace_id,
    organization_id,
    invoice_id,
    client_id,
    amount,
    currency,
    payment_date,
    method,
    status,
    transaction_id
  )
  SELECT
    i.workspace_id,
    v_org_id,
    i.id,
    i.client_id,
    100,
    'USD',
    CURRENT_DATE,
    'manual',
    'completed',
    v_prefix || '-PAY-TXN-1'
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_pay,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_pay,'item_description','Paid line replaced','quantity','1','unit_price','800')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT paid, total, outstanding
  INTO v_total_paid, v_amount, v_outstanding
  FROM public.invoices_view
  WHERE id = v_invoice_id;

  IF v_total_paid <> 100 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_H_PAYMENT: expected view paid 100, got %', v_total_paid;
  END IF;
  IF v_amount <> 800 OR v_outstanding <> 700 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_H_PAYMENT: expected view total 800 outstanding 700, got total=% outstanding=%', v_amount, v_outstanding;
  END IF;
  IF (SELECT count(*) FROM public.payments WHERE invoice_id = v_invoice_id AND archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_H_PAYMENT: payment row was altered or removed';
  END IF;
  RAISE NOTICE 'TEST_H_PAYMENT: PASS';

  -- --------------------------------------------------------------------------
  -- TEST E — BATCH ATOMICITY (soft failure rolls back entire batch)
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_ws_a;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_atomic_ok,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_atomic_ok,'item_description','Good','quantity','1','unit_price','100'),
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_atomic_fail,'client_name', v_prefix || ' Dup Name','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_atomic_fail,'item_description','Bad','quantity','1','unit_price','50')
  );

  BEGIN
    PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);
    RAISE EXCEPTION 'VERIFY_FAILED TEST_E_ATOMICITY: expected execute failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invoice_import_failed%' AND SQLERRM NOT LIKE '%Multiple clients match name%' THEN
      RAISE EXCEPTION 'VERIFY_FAILED TEST_E_ATOMICITY: unexpected error: %', SQLERRM;
    END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_atomic_ok) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_E_ATOMICITY: invoice A persisted after failed batch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_atomic_fail) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_E_ATOMICITY: invoice B persisted after failed batch';
  END IF;
  IF (SELECT count(*) FROM public.invoices WHERE workspace_id = v_ws_a) <> v_invoice_count THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_E_ATOMICITY: invoice count changed after failed batch';
  END IF;
  RAISE NOTICE 'TEST_E_ATOMICITY: PASS';

  -- --------------------------------------------------------------------------
  -- TEST G — RETRY after failed batch
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_retry,'client_email', v_prefix || '-client-a@verify.local','client_name', v_prefix || ' Client A','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_retry,'item_description','Retry item','quantity','1','unit_price','250')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_a, v_rows, false);

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_ws_a AND invoice_number = v_inv_retry;
  IF v_invoice_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_G_RETRY: expected 1 invoice after retry, got %', v_invoice_count;
  END IF;
  RAISE NOTICE 'TEST_G_RETRY: PASS';

  -- --------------------------------------------------------------------------
  -- TEST I — NET-NEW ENTITLEMENT (wrapper counts updates separately)
  -- Start at 73/75, seed one existing invoice (74/75), then:
  --   mixed update+create batch counts as 1 net-new (should succeed -> 75/75)
  --   two net-new invoices should fail preflight at 75/75
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_exist,'client_email', v_prefix || '-trial@verify.local','client_name', v_prefix || ' Trial Client','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_exist,'item_description','Existing','quantity','1','unit_price','10')
  );
  PERFORM public.import_invoices_grouped(v_ws_trial, v_rows, false);

  SELECT COUNT(*)::integer
  INTO v_net_new
  FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_exist),
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_new1)
  )) elem
  WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'invoice'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.workspace_id = v_ws_trial
        AND i.invoice_number = COALESCE(elem->>'invoice_number', '')
        AND i.archived_at IS NULL
    );

  IF v_net_new <> 1 THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_I_NET_NEW: expected net-new count 1 (1 update + 1 create), got %', v_net_new;
  END IF;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_exist,'client_email', v_prefix || '-trial@verify.local','client_name', v_prefix || ' Trial Client','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_exist,'item_description','Existing updated','quantity','1','unit_price','10'),
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_new1,'client_email', v_prefix || '-trial@verify.local','client_name', v_prefix || ' Trial Client','issue_date','2026-07-02','due_date','2026-08-02','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_new1,'item_description','New one','quantity','1','unit_price','20')
  );
  PERFORM public.import_invoices_grouped(v_ws_trial, v_rows, false);

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_ws_trial AND invoice_number = v_inv_new1) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_I_NET_NEW: mixed update+create batch should have inserted net-new invoice';
  END IF;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_new2,'client_email', v_prefix || '-trial@verify.local','client_name', v_prefix || ' Trial Client','issue_date','2026-07-03','due_date','2026-08-03','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_new2,'item_description','New two','quantity','1','unit_price','30'),
    jsonb_build_object('row_type','invoice','invoice_number', v_prefix || '-NEW3','client_email', v_prefix || '-trial@verify.local','client_name', v_prefix || ' Trial Client','issue_date','2026-07-04','due_date','2026-08-04','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_prefix || '-NEW3','item_description','New three','quantity','1','unit_price','40')
  );

  BEGIN
    PERFORM public.import_invoices_grouped(v_ws_trial, v_rows, false);
    RAISE EXCEPTION 'VERIFY_FAILED TEST_I_NET_NEW: expected entitlement preflight failure for 2 net-new at 75/75';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%trial_invoice_limit_reached%' THEN
      RAISE EXCEPTION 'VERIFY_FAILED TEST_I_NET_NEW: unexpected entitlement error: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'TEST_I_NET_NEW: PASS';

  -- --------------------------------------------------------------------------
  -- TEST J — CROSS-WORKSPACE ISOLATION
  -- --------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_ws_b) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_J_TENANT: workspace B had invoices before isolated import';
  END IF;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type','invoice','invoice_number', v_inv_other,'client_email', v_prefix || '-client-b@verify.local','client_name', v_prefix || ' Client B','issue_date','2026-07-01','due_date','2026-08-01','currency','USD','status','sent'),
    jsonb_build_object('row_type','item','invoice_number', v_inv_other,'item_description','Other ws item','quantity','1','unit_price','10')
  );
  PERFORM public.internal_import_invoices_grouped(v_ws_b, v_rows, false);

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_ws_b AND invoice_number = v_inv_other) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_J_TENANT: workspace B import failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.clients c ON c.id = i.client_id
    WHERE i.workspace_id = v_ws_b AND c.workspace_id <> v_ws_b
  ) THEN
    RAISE EXCEPTION 'VERIFY_FAILED TEST_J_TENANT: cross-workspace client linkage detected';
  END IF;
  RAISE NOTICE 'TEST_J_TENANT: PASS';

  RAISE NOTICE 'ARREXIA_IMPORT_P0_VERIFICATION_PASS';
END $$;

-- Final safety statement: discard ALL changes from this verification run
ROLLBACK;
