-- ============================================================================
-- STAGING / LOCAL ONLY — NEVER RUN ON PRODUCTION
-- Integration: rpc_create_invoice_with_items atomicity
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/rpcCreateInvoiceAtomicity.integration.sql
-- Requires: migration 20260728000000_rpc_create_invoice_with_items.sql applied
-- ============================================================================

BEGIN;

-- Failure injection: session-local trigger (rolled back with transaction).
-- Fires only when line item name equals __FAIL_INSERT_TEST__.
CREATE OR REPLACE FUNCTION public.__test_fail_create_invoice_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name = '__FAIL_INSERT_TEST__' THEN
    RAISE EXCEPTION 'test create insert failure after header';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER __test_fail_create_invoice_item_insert_trg
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.__test_fail_create_invoice_item_insert();

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_archived_client_id uuid := gen_random_uuid();
  v_inactive_client_id uuid := gen_random_uuid();
  v_invoice_id uuid;
  v_invoice_count integer;
  v_item_count integer;
  v_result jsonb;
  v_items jsonb;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user_id, 'rpc-create-test@example.com', crypt('test', gen_salt('bf')), now(), now(), now());

  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'RPC Create Test Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'RPC Create Test Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Workspace');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_client_id, v_workspace_id, v_org_id, 'Active Client', 'active@example.com', true),
    (v_archived_client_id, v_workspace_id, v_org_id, 'Archived Client', 'archived@example.com', true),
    (v_inactive_client_id, v_workspace_id, v_org_id, 'Inactive Client', 'inactive@example.com', false);

  UPDATE public.clients SET archived_at = now() WHERE id = v_archived_client_id;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_items := jsonb_build_array(
    jsonb_build_object('name', 'Line A', 'description', 'd', 'quantity', 2, 'unit_price', 50, 'position', 1),
    jsonb_build_object('name', 'Line B', 'quantity', 1, 'unit_price', 25, 'position', 2)
  );

  -- Cross-workspace client rejection (client not in other workspace)
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_other_workspace_id, v_client_id, 'INV-9101',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      125, 0, 0, 0, 0, 125, v_items
    );
    RAISE EXCEPTION 'expected cross-workspace rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Not a workspace member%' AND SQLERRM NOT LIKE '%Client not found%' THEN
      RAISE;
    END IF;
  END;

  -- Unauthenticated rejection
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_client_id, 'INV-9102',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      100, 0, 0, 0, 0, 100, v_items
    );
    RAISE EXCEPTION 'expected unauthenticated rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Not authenticated%' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- Archived client rejection
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_archived_client_id, 'INV-9103',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      100, 0, 0, 0, 0, 100, v_items
    );
    RAISE EXCEPTION 'expected archived client rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot create invoice for archived client%' THEN
      RAISE;
    END IF;
  END;

  -- Inactive client rejection
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_inactive_client_id, 'INV-9104',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      100, 0, 0, 0, 0, 100, v_items
    );
    RAISE EXCEPTION 'expected inactive client rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot create invoice for inactive client%' THEN
      RAISE;
    END IF;
  END;

  -- Empty items rejection
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_client_id, 'INV-9105',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      0, 0, 0, 0, 0, 0, '[]'::jsonb
    );
    RAISE EXCEPTION 'expected empty items rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%At least one line item is required%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;
  IF v_invoice_count <> 0 THEN
    RAISE EXCEPTION 'guard rejections created invoices (count=%)', v_invoice_count;
  END IF;

  -- Failure injection: header insert then item insert fails → no invoice remains
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_client_id, 'INV-9106',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'fail-test', 'draft', 'net_30', 30, 'USD',
      300, 0, 0, 0, 0, 300,
      jsonb_build_array(
        jsonb_build_object('name', '__FAIL_INSERT_TEST__', 'quantity', 1, 'unit_price', 300, 'position', 1)
      )
    );
    RAISE EXCEPTION 'expected create failure injection to raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%test create insert failure after header%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_item_count
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.workspace_id = v_workspace_id;

  IF v_invoice_count <> 0 OR v_item_count <> 0 THEN
    RAISE EXCEPTION 'atomicity failure: invoices=% items=% after failed create', v_invoice_count, v_item_count;
  END IF;

  -- Successful draft creation
  v_result := public.rpc_create_invoice_with_items(
    v_workspace_id, v_client_id, 'INV-9107',
    CURRENT_DATE, CURRENT_DATE + 30, 'PO-DRAFT', 'draft-notes', 'draft', 'net_30', 30, 'USD',
    125, 0, 0, 0, 0, 125, v_items
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;

  IF v_result->>'ok' IS DISTINCT FROM 'true' OR v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'draft create failed';
  END IF;

  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_item_count <> 2 THEN
    RAISE EXCEPTION 'draft create item count=%', v_item_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = v_invoice_id AND status = 'draft' AND amount = 125 AND currency = 'USD'
  ) THEN
    RAISE EXCEPTION 'draft header mismatch';
  END IF;

  -- Successful sent creation
  v_result := public.rpc_create_invoice_with_items(
    v_workspace_id, v_client_id, 'INV-9108',
    CURRENT_DATE, CURRENT_DATE + 30, NULL, 'sent-notes', 'sent', 'net_30', 30, 'USD',
    100, 0, 0, 0, 0, 100,
    jsonb_build_array(
      jsonb_build_object('name', 'Sent Item', 'quantity', 1, 'unit_price', 100, 'position', 1)
    )
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = (v_result->>'invoice_id')::uuid AND status = 'sent' AND amount = 100
  ) THEN
    RAISE EXCEPTION 'sent create mismatch';
  END IF;

  -- Duplicate invoice-number rejection
  BEGIN
    PERFORM public.rpc_create_invoice_with_items(
      v_workspace_id, v_client_id, 'INV-9107',
      CURRENT_DATE, CURRENT_DATE + 30, NULL, NULL, 'draft', 'net_30', 30, 'USD',
      50, 0, 0, 0, 0, 50,
      jsonb_build_array(
        jsonb_build_object('name', 'Dup', 'quantity', 1, 'unit_price', 50, 'position', 1)
      )
    );
    RAISE EXCEPTION 'expected duplicate invoice number rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%unique%' AND SQLERRM NOT LIKE '%duplicate%' AND SQLSTATE <> '23505' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
