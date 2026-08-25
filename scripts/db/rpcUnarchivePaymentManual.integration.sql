-- Integration: rpc_unarchive_payment_manual restore hardening (PAY-001)
-- Run against a migration-applied database (local supabase db reset).
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/rpcUnarchivePaymentManual.integration.sql

BEGIN;

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_payment_a_id uuid := gen_random_uuid();
  v_payment_b_id uuid := gen_random_uuid();
  v_paid numeric;
  v_outstanding numeric;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user_id, 'rpc-unarchive-test@example.com', crypt('test', gen_salt('bf')), now(), now(), now());

  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'Unarchive Test Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'Unarchive Test Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Workspace');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES (v_client_id, v_workspace_id, v_org_id, 'Unarchive Client', 'client@example.com', true);

  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    status, amount, currency, issue_date, due_date,
    subtotal, discount_percent, discount_amount, tax_percent, tax_amount
  ) VALUES (
    v_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-UNARCHIVE-1000',
    'sent', 1000, 'USD', CURRENT_DATE, CURRENT_DATE + 30,
    1000, 0, 0, 0, 0
  );

  INSERT INTO public.payments (
    id, workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status, archived_at
  ) VALUES (
    v_payment_a_id, v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    700, 'USD', CURRENT_DATE, 'completed', now()
  );

  INSERT INTO public.payments (
    id, workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_payment_b_id, v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    300, 'USD', CURRENT_DATE, 'completed'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Scenario 1: restore A when B=300 active -> paid becomes 1000 exactly
  PERFORM public.rpc_unarchive_payment_manual(v_workspace_id, v_payment_a_id);

  SELECT paid, outstanding
  INTO v_paid, v_outstanding
  FROM public.invoices_view
  WHERE id = v_invoice_id;

  IF v_paid <> 1000 OR v_outstanding <> 0 THEN
    RAISE EXCEPTION 'scenario 1 mismatch paid=% outstanding=%', v_paid, v_outstanding;
  END IF;

  -- Re-archive A for scenario 2
  UPDATE public.payments SET archived_at = now() WHERE id = v_payment_a_id;

  SELECT paid, outstanding
  INTO v_paid, v_outstanding
  FROM public.invoices_view
  WHERE id = v_invoice_id;

  IF v_paid <> 300 OR v_outstanding <> 700 THEN
    RAISE EXCEPTION 're-archive A mismatch paid=% outstanding=%', v_paid, v_outstanding;
  END IF;

  -- Add another completed payment 500 -> active paid 800
  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id,
    amount, currency, payment_date, status
  ) VALUES (
    v_workspace_id, v_org_id, v_invoice_id, v_client_id,
    500, 'USD', CURRENT_DATE, 'completed'
  );

  SELECT paid, outstanding
  INTO v_paid, v_outstanding
  FROM public.invoices_view
  WHERE id = v_invoice_id;

  IF v_paid <> 800 OR v_outstanding <> 200 THEN
    RAISE EXCEPTION 'after +500 mismatch paid=% outstanding=%', v_paid, v_outstanding;
  END IF;

  -- Scenario 2: restore A (700) must reject (only 200 outstanding)
  BEGIN
    PERFORM public.rpc_unarchive_payment_manual(v_workspace_id, v_payment_a_id);
    RAISE EXCEPTION 'expected restore overpay rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Restoring this payment would exceed the invoice outstanding balance.%' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.payments WHERE id = v_payment_a_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'overpay rejection still restored payment A';
  END IF;

  -- Cross-workspace rejection
  BEGIN
    PERFORM public.rpc_unarchive_payment_manual(v_other_workspace_id, v_payment_a_id);
    RAISE EXCEPTION 'expected cross-workspace rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Not a workspace member%' AND SQLERRM NOT LIKE '%Payment not found%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
