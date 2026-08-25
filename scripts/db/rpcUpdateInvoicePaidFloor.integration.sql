-- Integration: rpc_update_invoice_with_items paid-floor guard (F1)
-- Run against a migration-applied database (local supabase db reset).
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/rpcUpdateInvoicePaidFloor.integration.sql

BEGIN;

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_header_amount numeric;
  v_header_notes text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user_id, 'rpc-paid-floor@example.com', crypt('test', gen_salt('bf')), now(), now(), now());

  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'Paid Floor Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES (v_workspace_id, v_org_id, 'Paid Floor Workspace');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email)
  VALUES (v_client_id, v_workspace_id, v_org_id, 'Paid Floor Client', 'client@example.com');

  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    status, amount, currency, issue_date, due_date, notes,
    subtotal, discount_percent, discount_amount, tax_percent, tax_amount
  ) VALUES (
    v_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-PAID-FLOOR',
    'sent', 3306, 'USD', CURRENT_DATE, CURRENT_DATE + 30, 'baseline',
    3306, 0, 0, 0, 0
  );

  INSERT INTO public.invoice_items (
    organization_id, invoice_id, name, quantity, unit_price, position
  ) VALUES (
    v_org_id, v_invoice_id, 'Line', 1, 3306, 1
  );

  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    1500, 'USD', CURRENT_DATE, 'completed'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Reject: new total 1000 below paid 1500
  BEGIN
    PERFORM public.rpc_update_invoice_with_items(
      v_workspace_id, v_invoice_id,
      CURRENT_DATE, CURRENT_DATE + 30, NULL, 'x', 'sent', 'net_30', 30,
      1000, 0, 0, 0, 0, 1000,
      jsonb_build_array(jsonb_build_object('name', 'X', 'quantity', 1, 'unit_price', 1000, 'position', 1))
    );
    RAISE EXCEPTION 'expected paid-floor rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invoice total cannot be less than the amount already paid.%' THEN
      RAISE;
    END IF;
  END;

  SELECT amount, notes INTO v_header_amount, v_header_notes
  FROM public.invoices WHERE id = v_invoice_id;

  IF v_header_amount <> 3306 OR v_header_notes <> 'baseline' THEN
    RAISE EXCEPTION 'paid-floor rejection mutated invoice (amount=%, notes=%)',
      v_header_amount, v_header_notes;
  END IF;

  -- Allow: new total 2000 >= paid 1500
  PERFORM public.rpc_update_invoice_with_items(
    v_workspace_id, v_invoice_id,
    CURRENT_DATE, CURRENT_DATE + 30, NULL, 'allowed-edit', 'sent', 'net_30', 30,
    2000, 0, 0, 0, 0, 2000,
    jsonb_build_array(jsonb_build_object('name', 'Allowed', 'quantity', 1, 'unit_price', 2000, 'position', 1))
  );

  SELECT amount, notes INTO v_header_amount, v_header_notes
  FROM public.invoices WHERE id = v_invoice_id;

  IF v_header_amount <> 2000 OR v_header_notes <> 'allowed-edit' THEN
    RAISE EXCEPTION 'allowed paid-floor edit failed (amount=%, notes=%)',
      v_header_amount, v_header_notes;
  END IF;

  -- Pending payment must not inflate effective paid
  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    500, 'USD', CURRENT_DATE, 'pending'
  );

  PERFORM public.rpc_update_invoice_with_items(
    v_workspace_id, v_invoice_id,
    CURRENT_DATE, CURRENT_DATE + 30, NULL, 'pending-ignored', 'sent', 'net_30', 30,
    1500, 0, 0, 0, 0, 1500,
    jsonb_build_array(jsonb_build_object('name', 'Exact Paid', 'quantity', 1, 'unit_price', 1500, 'position', 1))
  );

  SELECT notes INTO v_header_notes FROM public.invoices WHERE id = v_invoice_id;
  IF v_header_notes <> 'pending-ignored' THEN
    RAISE EXCEPTION 'pending payment incorrectly affected paid-floor guard';
  END IF;
END;
$$;

ROLLBACK;
