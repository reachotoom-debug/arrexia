-- ============================================================================
-- STAGING / LOCAL ONLY — NEVER RUN ON PRODUCTION
-- Integration: rpc_import_payments lifecycle hardening (PAY-IMP-NEW-001)
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/paymentImportLifecycle.integration.sql
-- Requires: migrations through 20260826120000_rpc_import_payments_lifecycle_hardening.sql applied
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_active_client_id uuid := gen_random_uuid();
  v_inactive_client_id uuid := gen_random_uuid();
  v_archived_client_id uuid := gen_random_uuid();
  v_sent_invoice_id uuid := gen_random_uuid();
  v_draft_invoice_id uuid := gen_random_uuid();
  v_void_invoice_id uuid := gen_random_uuid();
  v_custom_invoice_id uuid := gen_random_uuid();
  v_inactive_client_invoice_id uuid := gen_random_uuid();
  v_archived_client_invoice_id uuid := gen_random_uuid();
  v_other_workspace_client_id uuid := gen_random_uuid();
  v_other_workspace_invoice_id uuid := gen_random_uuid();
  v_empty_workspace_id uuid := gen_random_uuid();
  v_result jsonb;
  v_row jsonb;
  v_error text;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'Payment Import Lifecycle Test Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'Lifecycle Test Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Lifecycle Workspace');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_active_client_id, v_workspace_id, v_org_id, 'Active Client', 'active@example.com', true),
    (v_inactive_client_id, v_workspace_id, v_org_id, 'Inactive Client', 'inactive@example.com', false),
    (v_archived_client_id, v_workspace_id, v_org_id, 'Archived Client', 'archived@example.com', true);

  UPDATE public.clients
  SET archived_at = NOW()
  WHERE id = v_archived_client_id;

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_other_workspace_client_id, v_other_workspace_id, v_org_id, 'Other WS Client', 'other@example.com', true);

  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    issue_date, due_date, status, currency, amount
  )
  VALUES
    (v_sent_invoice_id, v_workspace_id, v_org_id, v_active_client_id, 'INV-0004',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 100),
    (v_custom_invoice_id, v_workspace_id, v_org_id, v_active_client_id, 'TEST-IMP-004',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 100),
    (v_draft_invoice_id, v_workspace_id, v_org_id, v_active_client_id, 'DRAFT-001',
     CURRENT_DATE, CURRENT_DATE + 30, 'draft', 'USD', 100),
    (v_void_invoice_id, v_workspace_id, v_org_id, v_active_client_id, 'VOID-001',
     CURRENT_DATE, CURRENT_DATE + 30, 'void', 'USD', 100),
    (v_inactive_client_invoice_id, v_workspace_id, v_org_id, v_inactive_client_id, 'INACTIVE-001',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 100),
    (v_archived_client_invoice_id, v_workspace_id, v_org_id, v_archived_client_id, 'ARCH-CLIENT-001',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 100),
    (v_other_workspace_invoice_id, v_other_workspace_id, v_org_id, v_other_workspace_client_id, 'TEST-IMP-004',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 100);

  -- sent invoice accepts payment (IMP-004 custom + standard INV-*)
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'custom-ok',
    'invoice_number', 'TEST-IMP-004',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 25,
    'status', 'completed',
    'transaction_id', 'tx-custom-ok'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  IF (v_result->>'inserted')::int <> 1 OR (v_result->'results'->0->>'status') <> 'ok' THEN
    RAISE EXCEPTION 'expected TEST-IMP-004 payment to succeed, got %', v_result;
  END IF;

  -- Standard INV-* still works
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'inv-ok',
    'invoice_number', 'INV-0004',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 25,
    'status', 'completed',
    'transaction_id', 'tx-inv-ok'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  IF (v_result->>'inserted')::int <> 1 THEN
    RAISE EXCEPTION 'expected INV-0004 payment to succeed, got %', v_result;
  END IF;

  -- Missing invoice rejected
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'missing',
    'invoice_number', 'NO-SUCH-INVOICE',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-missing'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error NOT LIKE 'Invoice not found:%' THEN
    RAISE EXCEPTION 'expected missing invoice error, got %', v_error;
  END IF;

  -- Workspace isolation: invoice number exists only in another workspace
  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES (v_empty_workspace_id, v_org_id, 'Empty Lifecycle Workspace');

  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'cross-ws',
    'invoice_number', 'TEST-IMP-004',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-cross-ws-empty'
  ));
  v_result := public.rpc_import_payments(v_empty_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error NOT LIKE 'Invoice not found:%' THEN
    RAISE EXCEPTION 'expected cross-workspace isolation failure, got %', v_error;
  END IF;

  -- Draft invoice rejected
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'draft',
    'invoice_number', 'DRAFT-001',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-draft'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error <> 'Cannot create payment for draft invoice. Invoice must be sent first.' THEN
    RAISE EXCEPTION 'expected draft rejection, got %', v_error;
  END IF;

  -- Void invoice rejected
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'void',
    'invoice_number', 'VOID-001',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-void'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error <> 'Cannot create payment for void invoice' THEN
    RAISE EXCEPTION 'expected void rejection, got %', v_error;
  END IF;

  -- Inactive client rejected
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'inactive-client',
    'invoice_number', 'INACTIVE-001',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-inactive-client'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error <> 'Cannot create payment for inactive client' THEN
    RAISE EXCEPTION 'expected inactive client rejection, got %', v_error;
  END IF;

  -- Archived client rejected
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'archived-client',
    'invoice_number', 'ARCH-CLIENT-001',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 10,
    'status', 'completed',
    'transaction_id', 'tx-archived-client'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error <> 'Cannot create payment for archived client' THEN
    RAISE EXCEPTION 'expected archived client rejection, got %', v_error;
  END IF;

  -- Overpayment still blocked on sent invoice
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'overpay',
    'invoice_number', 'INV-0004',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 1000,
    'status', 'completed',
    'transaction_id', 'tx-overpay'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  v_error := v_result->'results'->0->>'error';
  IF v_error NOT LIKE 'Payment exceeds invoice outstanding balance.%' THEN
    RAISE EXCEPTION 'expected overpay rejection, got %', v_error;
  END IF;

  -- Pending payment on sent invoice still allowed (non-effective)
  v_row := jsonb_build_array(jsonb_build_object(
    'rowId', 'pending',
    'invoice_number', 'INV-0004',
    'payment_date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'amount', 1000,
    'status', 'pending',
    'transaction_id', 'tx-pending'
  ));
  v_result := public.rpc_import_payments(v_workspace_id, v_row, false);
  IF (v_result->'results'->0->>'status') <> 'ok' THEN
    RAISE EXCEPTION 'expected pending payment to succeed, got %', v_result;
  END IF;

  RAISE NOTICE 'paymentImportLifecycle.integration.sql — all lifecycle checks passed';
END $$;

ROLLBACK;
