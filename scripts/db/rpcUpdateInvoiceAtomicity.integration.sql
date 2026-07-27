-- Integration: rpc_update_invoice_with_items atomicity
-- Run against a migration-applied database (local supabase db reset).
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/rpcUpdateInvoiceAtomicity.integration.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.__test_fail_invoice_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name = '__FAIL_INSERT_TEST__' THEN
    RAISE EXCEPTION 'test insert failure after delete';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER __test_fail_invoice_item_insert_trg
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.__test_fail_invoice_item_insert();

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_paid_invoice_id uuid := gen_random_uuid();
  v_archived_invoice_id uuid := gen_random_uuid();
  v_header_notes text;
  v_header_amount numeric;
  v_item_count integer;
  v_item_name text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user_id, 'rpc-update-test@example.com', crypt('test', gen_salt('bf')), now(), now(), now());

  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'RPC Test Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'RPC Test Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Workspace');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email)
  VALUES (v_client_id, v_workspace_id, v_org_id, 'RPC Test Client', 'client@example.com');

  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    status, amount, currency, issue_date, due_date, notes,
    subtotal, discount_percent, discount_amount, tax_percent, tax_amount
  ) VALUES (
    v_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-9001',
    'sent', 200, 'USD', CURRENT_DATE, CURRENT_DATE + 30, 'original-notes',
    200, 0, 0, 0, 0
  );

  INSERT INTO public.invoice_items (
    id, organization_id, invoice_id, name, description, quantity, unit_price, position
  ) VALUES (
    v_item_id, v_org_id, v_invoice_id, 'Original Item', 'desc', 1, 200, 1
  );

  -- Fully paid invoice fixture
  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    status, amount, currency, issue_date, due_date
  ) VALUES (
    v_paid_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-9002',
    'sent', 100, 'USD', CURRENT_DATE, CURRENT_DATE + 30
  );

  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_workspace_id, v_org_id, v_paid_invoice_id, v_client_id,
    100, 'USD', CURRENT_DATE, 'completed'
  );

  -- Archived invoice fixture
  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    status, amount, currency, issue_date, due_date, archived_at
  ) VALUES (
    v_archived_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-9003',
    'sent', 50, 'USD', CURRENT_DATE, CURRENT_DATE + 30, now()
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- C: cross-workspace rejection
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_other_workspace_id, v_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'hack', 'sent', 'net_30', 30,
      100, 0, 0, 0, 0, 100,
      jsonb_build_array(jsonb_build_object('name', 'X', 'quantity', 1, 'unit_price', 100, 'position', 1))
    );
    RAISE EXCEPTION 'expected cross-workspace rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Not a workspace member%' AND SQLERRM NOT LIKE '%Invoice not found%' THEN
      RAISE;
    END IF;
  END;

  -- D: archived rejection
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_workspace_id, v_archived_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'x', 'sent', 'net_30', 30,
      50, 0, 0, 0, 0, 50,
      jsonb_build_array(jsonb_build_object('name', 'X', 'quantity', 1, 'unit_price', 50, 'position', 1))
    );
    RAISE EXCEPTION 'expected archived rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot edit an archived invoice%' THEN
      RAISE;
    END IF;
  END;

  -- E: fully paid rejection
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_workspace_id, v_paid_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'x', 'sent', 'net_30', 30,
      100, 0, 0, 0, 0, 100,
      jsonb_build_array(jsonb_build_object('name', 'X', 'quantity', 1, 'unit_price', 100, 'position', 1))
    );
    RAISE EXCEPTION 'expected fully paid rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot edit a fully paid invoice%' THEN
      RAISE;
    END IF;
  END;

  -- G: empty items rejection
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_workspace_id, v_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'x', 'sent', 'net_30', 30,
      0, 0, 0, 0, 0, 0,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected empty items rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%At least one line item is required%' THEN
      RAISE;
    END IF;
  END;

  SELECT notes, amount INTO v_header_notes, v_header_amount
  FROM public.invoices WHERE id = v_invoice_id;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  SELECT name INTO v_item_name FROM public.invoice_items WHERE id = v_item_id;

  IF v_header_notes <> 'original-notes' OR v_header_amount <> 200 OR v_item_count <> 1 OR v_item_name <> 'Original Item' THEN
    RAISE EXCEPTION 'guard rejections mutated invoice (notes=%, amount=%, items=%, name=%)',
      v_header_notes, v_header_amount, v_item_count, v_item_name;
  END IF;

  -- B: failure after delete rolls back header + items
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_workspace_id, v_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 45, NULL, 'mutated-notes', 'sent', 'net_30', 30,
      300, 0, 0, 0, 0, 300,
      jsonb_build_array(
        jsonb_build_object('name', '__FAIL_INSERT_TEST__', 'quantity', 1, 'unit_price', 300, 'position', 1)
      )
    );
    RAISE EXCEPTION 'expected insert failure rollback test to raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%test insert failure after delete%' THEN
      RAISE;
    END IF;
  END;

  SELECT notes, amount INTO v_header_notes, v_header_amount
  FROM public.invoices WHERE id = v_invoice_id;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  SELECT name INTO v_item_name FROM public.invoice_items WHERE id = v_item_id;

  IF v_header_notes <> 'original-notes' OR v_header_amount <> 200 OR v_item_count <> 1 OR v_item_name <> 'Original Item' THEN
    RAISE EXCEPTION 'atomicity failure: invoice mutated after insert error (notes=%, amount=%, items=%, name=%)',
      v_header_notes, v_header_amount, v_item_count, v_item_name;
  END IF;

  -- A: successful edit replaces items and updates header
  PERFORM public.rpc_update_invoice_with_items(
    v_workspace_id, v_invoice_id,
    CURRENT_DATE, CURRENT_DATE + 60, 'PO-1', 'updated-notes', 'sent', 'net_30', 30,
    150, 0, 0, 0, 0, 150,
    jsonb_build_array(
      jsonb_build_object('name', 'Replacement Item', 'description', 'new', 'quantity', 3, 'unit_price', 50, 'position', 1)
    )
  );

  SELECT notes, amount INTO v_header_notes, v_header_amount
  FROM public.invoices WHERE id = v_invoice_id;
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  SELECT name INTO v_item_name
  FROM public.invoice_items
  WHERE invoice_id = v_invoice_id
  ORDER BY position
  LIMIT 1;

  IF v_header_notes <> 'updated-notes' OR v_header_amount <> 150 OR v_item_count <> 1 OR v_item_name <> 'Replacement Item' THEN
    RAISE EXCEPTION 'successful edit mismatch (notes=%, amount=%, items=%, name=%)',
      v_header_notes, v_header_amount, v_item_count, v_item_name;
  END IF;

  -- F: partially paid invoice remains editable (outstanding > 0.01)
  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    50, 'USD', CURRENT_DATE, 'completed'
  );

  PERFORM public.rpc_update_invoice_with_items(
    v_workspace_id, v_invoice_id,
    CURRENT_DATE, CURRENT_DATE + 60, 'PO-1', 'partial-edit', 'sent', 'net_30', 30,
    120, 0, 0, 0, 0, 120,
    jsonb_build_array(
      jsonb_build_object('name', 'Partial Edit Item', 'quantity', 1, 'unit_price', 120, 'position', 1)
    )
  );

  SELECT notes INTO v_header_notes FROM public.invoices WHERE id = v_invoice_id;
  IF v_header_notes <> 'partial-edit' THEN
    RAISE EXCEPTION 'partially paid edit failed';
  END IF;
END;
$$;

ROLLBACK;
