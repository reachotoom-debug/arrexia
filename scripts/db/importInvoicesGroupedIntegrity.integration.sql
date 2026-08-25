-- ============================================================================
-- STAGING / LOCAL ONLY — NEVER RUN ON PRODUCTION
-- Integration: import_invoices_grouped financial integrity + atomicity
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/importInvoicesGroupedIntegrity.integration.sql
-- Requires: migrations through 20260825150000_invoice_import_financial_hardening.sql applied
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.__test_fail_import_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.description = '__FAIL_ITEM_INSERT__' THEN
    RAISE EXCEPTION 'test import item insert failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER __test_fail_import_item_insert_trg
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.__test_fail_import_item_insert();

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_dup_client_a uuid := gen_random_uuid();
  v_dup_client_b uuid := gen_random_uuid();
  v_other_client_id uuid := gen_random_uuid();
  v_archived_client_id uuid := gen_random_uuid();
  v_temp_client_id uuid := gen_random_uuid();
  v_client_count_before integer;
  v_invoice_id uuid;
  v_result jsonb;
  v_rows jsonb;
  v_invoice_count integer;
  v_item_count integer;
  v_amount numeric;
  v_total_paid numeric;
  v_outstanding numeric;
  v_item_detail text;
  v_expected_five_sum constant numeric := 550;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'Import Integrity Test Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'Import Integrity Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Import Workspace');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_client_id, v_workspace_id, v_org_id, 'Acme Corp', 'acme@example.com', true),
    (v_dup_client_a, v_workspace_id, v_org_id, 'Duplicate Name Co', 'dup-a@example.com', true),
    (v_dup_client_b, v_workspace_id, v_org_id, 'Duplicate Name Co', 'dup-b@example.com', true),
    (v_other_client_id, v_other_workspace_id, v_org_id, 'Other Client', 'other@example.com', true);

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active, archived_at)
  VALUES (v_archived_client_id, v_workspace_id, v_org_id, 'Archived Co', 'archived@example.com', true, NOW());

  -- --------------------------------------------------------------------------
  -- Dry-run writes nothing
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'row_type', 'invoice',
      'invoice_number', 'INV-DRY-1',
      'client_email', 'acme@example.com',
      'client_name', 'Acme Corp',
      'issue_date', '2026-01-01',
      'due_date', '2026-02-01',
      'currency', 'USD',
      'status', 'sent'
    ),
    jsonb_build_object(
      'row_type', 'item',
      'invoice_number', 'INV-DRY-1',
      'item_description', 'Dry Run Item',
      'quantity', '1',
      'unit_price', '100'
    )
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, true);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'dry-run failed: %', v_result;
  END IF;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;
  IF v_invoice_count <> 0 THEN
    RAISE EXCEPTION 'dry-run wrote invoices (count=%)', v_invoice_count;
  END IF;

  -- --------------------------------------------------------------------------
  -- One invoice + one item
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'row_type', 'invoice',
      'invoice_number', 'INV-ONE-1',
      'client_email', 'acme@example.com',
      'client_name', 'Acme Corp',
      'issue_date', '2026-01-01',
      'due_date', '2026-02-01',
      'currency', 'USD',
      'status', 'sent'
    ),
    jsonb_build_object(
      'row_type', 'item',
      'invoice_number', 'INV-ONE-1',
      'item_description', 'Single Item',
      'quantity', '1',
      'unit_price', '100'
    )
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'single-item import failed: %', v_result;
  END IF;

  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices
  WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-ONE-1';

  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_item_count <> 1 OR v_amount <> 100 THEN
    RAISE EXCEPTION 'single-item mismatch items=% amount=%', v_item_count, v_amount;
  END IF;

  -- --------------------------------------------------------------------------
  -- One invoice + three items => amount 350
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'row_type', 'invoice',
      'invoice_number', 'INV-100',
      'client_email', 'acme@example.com',
      'client_name', 'Acme Corp',
      'issue_date', '2026-01-01',
      'due_date', '2026-02-01',
      'currency', 'USD',
      'status', 'sent'
    ),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-100', 'item_description', 'Item A', 'quantity', '1', 'unit_price', '100'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-100', 'item_description', 'Item B', 'quantity', '1', 'unit_price', '200'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-100', 'item_description', 'Item C', 'quantity', '1', 'unit_price', '50')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-100';
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;

  IF v_item_count <> 3 OR v_amount <> 350 THEN
    RAISE EXCEPTION 'three-item mismatch items=% amount=%', v_item_count, v_amount;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_amount FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_amount <> 350 THEN
    RAISE EXCEPTION 'three-item sum mismatch=%', v_amount;
  END IF;

  -- --------------------------------------------------------------------------
  -- One invoice + five items
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'row_type', 'invoice',
      'invoice_number', 'INV-FIVE',
      'client_email', 'acme@example.com',
      'client_name', 'Acme Corp',
      'issue_date', '2026-01-01',
      'due_date', '2026-02-01',
      'currency', 'USD',
      'status', 'sent'
    ),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-FIVE', 'item_description', 'A', 'quantity', '1', 'unit_price', '10'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-FIVE', 'item_description', 'B', 'quantity', '2', 'unit_price', '20'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-FIVE', 'item_description', 'C', 'quantity', '3', 'unit_price', '30'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-FIVE', 'item_description', 'D', 'quantity', '4', 'unit_price', '40'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-FIVE', 'item_description', 'E', 'quantity', '5', 'unit_price', '50')
  );

  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  SELECT id, amount INTO v_invoice_id, v_amount
  FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-FIVE';
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
    RAISE EXCEPTION 'five-item mismatch expected items=5 sum=%, got items=% sum=% persisted=[%]',
      v_expected_five_sum, v_item_count, v_amount, v_item_detail;
  END IF;

  -- --------------------------------------------------------------------------
  -- Batch of multiple valid invoices
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-BATCH-A', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-A', 'item_description', 'A1', 'quantity', '1', 'unit_price', '50'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-A', 'item_description', 'A2', 'quantity', '1', 'unit_price', '75'),
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-BATCH-B', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-02', 'due_date', '2026-02-02', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'B1', 'quantity', '2', 'unit_price', '100'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'B2', 'quantity', '1', 'unit_price', '25'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'B3', 'quantity', '1', 'unit_price', '25')
  );

  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);

  SELECT amount INTO v_amount FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-BATCH-A';
  IF v_amount <> 125 THEN
    RAISE EXCEPTION 'batch invoice A amount=%', v_amount;
  END IF;

  SELECT id, amount INTO v_invoice_id, v_amount FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-BATCH-B';
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_item_count <> 3 OR v_amount <> 250 THEN
    RAISE EXCEPTION 'batch invoice B items=% amount=%', v_item_count, v_amount;
  END IF;

  -- --------------------------------------------------------------------------
  -- Re-import replaces items: 3 old -> 2 new
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-BATCH-B', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-02', 'due_date', '2026-02-02', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'New 1', 'quantity', '1', 'unit_price', '300'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'New 2', 'quantity', '1', 'unit_price', '100')
  );

  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  SELECT id, amount INTO v_invoice_id, v_amount FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-BATCH-B';
  SELECT count(*) INTO v_item_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_item_count <> 2 OR v_amount <> 400 THEN
    RAISE EXCEPTION 're-import replace mismatch items=% amount=%', v_item_count, v_amount;
  END IF;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-BATCH-B';
  IF v_invoice_count <> 1 THEN
    RAISE EXCEPTION 're-import created duplicate invoice rows=%', v_invoice_count;
  END IF;

  -- --------------------------------------------------------------------------
  -- Existing invoice with payment preserved on update (payments are source of truth)
  -- --------------------------------------------------------------------------
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
    'IMPORT-INTEGRITY-PAY-TXN-1'
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-BATCH-B', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-02', 'due_date', '2026-02-02', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-BATCH-B', 'item_description', 'Paid Update 1', 'quantity', '1', 'unit_price', '500')
  );

  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);

  SELECT paid, total, outstanding
  INTO v_total_paid, v_amount, v_outstanding
  FROM public.invoices_view
  WHERE id = v_invoice_id;

  IF v_total_paid <> 100 OR v_amount <> 500 OR v_outstanding <> 400 THEN
    RAISE EXCEPTION 'payment preservation failed paid=% amount=% outstanding=%', v_total_paid, v_amount, v_outstanding;
  END IF;
  IF (SELECT count(*) FROM public.payments WHERE invoice_id = v_invoice_id AND archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'payment preservation removed or duplicated payment rows';
  END IF;

  -- --------------------------------------------------------------------------
  -- Paid-total guard: invalid reduction blocked; dry-run detects; payments untouched
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-PAID-GUARD', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-PAID-GUARD', 'item_description', 'Seed', 'quantity', '1', 'unit_price', '2000')
  );
  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);

  SELECT id INTO v_invoice_id FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-PAID-GUARD';

  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id, amount, currency, payment_date, method, status, transaction_id
  )
  SELECT i.workspace_id, v_org_id, i.id, i.client_id, 1500, 'USD', CURRENT_DATE, 'manual', 'completed', 'IMPORT-PAID-GUARD-TXN-1'
  FROM public.invoices i WHERE i.id = v_invoice_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-PAID-GUARD', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-PAID-GUARD', 'item_description', 'Reduced', 'quantity', '1', 'unit_price', '1000')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, true);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'paid-total dry-run should reject invalid reduction: %', v_result;
  END IF;

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'paid-total execute should reject invalid reduction: %', v_result;
  END IF;

  SELECT amount INTO v_amount FROM public.invoices WHERE id = v_invoice_id;
  IF v_amount <> 2000 THEN
    RAISE EXCEPTION 'paid-total guard changed invoice amount to %', v_amount;
  END IF;
  IF (SELECT amount FROM public.payments WHERE invoice_id = v_invoice_id AND archived_at IS NULL LIMIT 1) <> 1500 THEN
    RAISE EXCEPTION 'paid-total guard modified payment amount';
  END IF;

  -- Pending payment does not block valid reduction
  INSERT INTO public.payments (
    workspace_id, organization_id, invoice_id, client_id, amount, currency, payment_date, method, status, transaction_id
  )
  SELECT i.workspace_id, v_org_id, i.id, i.client_id, 500, 'USD', CURRENT_DATE, 'manual', 'pending', 'IMPORT-PAID-GUARD-PENDING'
  FROM public.invoices i WHERE i.id = v_invoice_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-PAID-GUARD', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-PAID-GUARD', 'item_description', 'Allowed reduction', 'quantity', '1', 'unit_price', '1600')
  );
  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'pending payment should not block valid reduction: %', v_result;
  END IF;

  SELECT paid, total INTO v_total_paid, v_amount FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_total_paid <> 1500 OR v_amount <> 1600 THEN
    RAISE EXCEPTION 'allowed reduction mismatch paid=% total=%', v_total_paid, v_amount;
  END IF;

  -- Batch rollback when one invoice violates paid-total guard
  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-PAID-BATCH-OK', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-PAID-BATCH-OK', 'item_description', 'Good', 'quantity', '1', 'unit_price', '100'),
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-PAID-GUARD', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-PAID-GUARD', 'item_description', 'Bad reduce', 'quantity', '1', 'unit_price', '1000')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'paid-total batch should reject invalid invoice in batch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-PAID-BATCH-OK') THEN
    RAISE EXCEPTION 'paid-total batch failure committed sibling invoice';
  END IF;

  IF (SELECT count(*) FROM public.invoices WHERE workspace_id = v_workspace_id) <> v_invoice_count THEN
    RAISE EXCEPTION 'paid-total batch failure changed invoice count';
  END IF;

  -- --------------------------------------------------------------------------
  -- Soft execute failure rolls back entire batch
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ATOMIC-OK', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ATOMIC-OK', 'item_description', 'Good Item', 'quantity', '1', 'unit_price', '100'),
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ATOMIC-FAIL', 'client_name', 'Duplicate Name Co', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ATOMIC-FAIL', 'item_description', 'Bad Item', 'quantity', '1', 'unit_price', '50')
  );

  BEGIN
    PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
    RAISE EXCEPTION 'expected soft execute failure to raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invoice_import_failed%' AND SQLERRM NOT LIKE '%Multiple clients match name%' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-ATOMIC-OK'
  ) THEN
    RAISE EXCEPTION 'soft failure left earlier invoice committed';
  END IF;

  IF (SELECT count(*) FROM public.invoices WHERE workspace_id = v_workspace_id) <> v_invoice_count THEN
    RAISE EXCEPTION 'soft failure changed invoice count';
  END IF;

  -- Retry failed batch succeeds cleanly
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ATOMIC-OK', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ATOMIC-OK', 'item_description', 'Good Item', 'quantity', '1', 'unit_price', '100'),
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ATOMIC-FIX', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ATOMIC-FIX', 'item_description', 'Fixed Item', 'quantity', '1', 'unit_price', '50')
  );

  PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);

  -- --------------------------------------------------------------------------
  -- Hard SQL failure rolls back
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-HARD-OK', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-HARD-OK', 'item_description', 'Good Item', 'quantity', '1', 'unit_price', '100'),
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-HARD-FAIL', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-HARD-FAIL', 'item_description', '__FAIL_ITEM_INSERT__', 'quantity', '1', 'unit_price', '50')
  );

  BEGIN
    PERFORM public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
    RAISE EXCEPTION 'expected hard failure to raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%test import item insert failure%' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-HARD-OK'
  ) THEN
    RAISE EXCEPTION 'hard failure left earlier invoice committed';
  END IF;

  -- --------------------------------------------------------------------------
  -- Cross-workspace isolation
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.invoices WHERE workspace_id = v_other_workspace_id
  ) THEN
    RAISE EXCEPTION 'other workspace was modified';
  END IF;

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-OTHER', 'client_email', 'other@example.com', 'client_name', 'Other Client', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-OTHER', 'item_description', 'Other Item', 'quantity', '1', 'unit_price', '10')
  );

  PERFORM public.internal_import_invoices_grouped(v_other_workspace_id, v_rows, false);

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices WHERE workspace_id = v_other_workspace_id AND invoice_number = 'INV-OTHER'
  ) THEN
    RAISE EXCEPTION 'other workspace import failed';
  END IF;

  -- --------------------------------------------------------------------------
  -- missing-client dry-run rejects
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-MISSING-CLIENT', 'client_email', 'missing@example.com', 'client_name', 'Missing Co', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-MISSING-CLIENT', 'item_description', 'Item', 'quantity', '1', 'unit_price', '10')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, true);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'missing-client dry-run rejects: %', v_result;
  END IF;

  SELECT count(*) INTO v_client_count_before FROM public.clients WHERE workspace_id = v_workspace_id;

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'missing-client execute should fail: %', v_result;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-MISSING-CLIENT') THEN
    RAISE EXCEPTION 'missing-client execute leaves zero invoices';
  END IF;

  IF (SELECT count(*) FROM public.clients WHERE workspace_id = v_workspace_id) <> v_client_count_before THEN
    RAISE EXCEPTION 'zero clients created on missing-client failure';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE i.workspace_id = v_workspace_id AND i.invoice_number = 'INV-MISSING-CLIENT') THEN
    RAISE EXCEPTION 'zero invoices/items created on missing-client failure';
  END IF;

  -- --------------------------------------------------------------------------
  -- archived client fails
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ARCHIVED-CLIENT', 'client_email', 'archived@example.com', 'client_name', 'Archived Co', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ARCHIVED-CLIENT', 'item_description', 'Item', 'quantity', '1', 'unit_price', '10')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'archived client fails: %', v_result;
  END IF;

  -- --------------------------------------------------------------------------
  -- cross-workspace client reference fails
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-CROSS-WORKSPACE-CLIENT', 'client_email', 'other@example.com', 'client_name', 'Other Client', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-CROSS-WORKSPACE-CLIENT', 'item_description', 'Item', 'quantity', '1', 'unit_price', '10')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'cross-workspace client reference fails: %', v_result;
  END IF;

  -- --------------------------------------------------------------------------
  -- client removed between dry-run and execute
  -- --------------------------------------------------------------------------
  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES (v_temp_client_id, v_workspace_id, v_org_id, 'Temp Client', 'temp-race@example.com', true);

  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-CLIENT-RACE', 'client_email', 'temp-race@example.com', 'client_name', 'Temp Client', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-CLIENT-RACE', 'item_description', 'Item', 'quantity', '1', 'unit_price', '10')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, true);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'client race dry-run should pass: %', v_result;
  END IF;

  DELETE FROM public.clients WHERE id = v_temp_client_id;

  SELECT count(*) INTO v_invoice_count FROM public.invoices WHERE workspace_id = v_workspace_id;

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'client removed between dry-run and execute should fail: %', v_result;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-CLIENT-RACE') THEN
    RAISE EXCEPTION 'client race failure committed invoice';
  END IF;

  IF (SELECT count(*) FROM public.invoices WHERE workspace_id = v_workspace_id) <> v_invoice_count THEN
    RAISE EXCEPTION 'client race failure changed invoice count';
  END IF;

  -- --------------------------------------------------------------------------
  -- IMP-002: zero quantity rejected before mutations (craft execute bypass)
  -- --------------------------------------------------------------------------
  v_rows := jsonb_build_array(
    jsonb_build_object('row_type', 'invoice', 'invoice_number', 'INV-ZERO-QTY', 'client_email', 'acme@example.com', 'client_name', 'Acme Corp', 'issue_date', '2026-01-01', 'due_date', '2026-02-01', 'currency', 'USD', 'status', 'sent'),
    jsonb_build_object('row_type', 'item', 'invoice_number', 'INV-ZERO-QTY', 'item_description', 'Item', 'quantity', '0', 'unit_price', '10')
  );

  v_result := public.internal_import_invoices_grouped(v_workspace_id, v_rows, false);
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'zero quantity execute should fail: %', v_result;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE workspace_id = v_workspace_id AND invoice_number = 'INV-ZERO-QTY') THEN
    RAISE EXCEPTION 'zero quantity failure committed invoice';
  END IF;

  -- --------------------------------------------------------------------------
  -- IMP-001 concurrency proof (manual two-session test — not automated here)
  -- Session A: internal_import_invoices_grouped(..., false) on existing invoice re-import
  -- Session B: rpc_create_payment_manual / rpc_update_payment_manual on same invoice
  -- Both serialize on public.invoices FOR UPDATE; only financially valid orderings commit.
  -- Verify with two psql sessions holding locks; no committed state may have paid > total.
  -- --------------------------------------------------------------------------
END;
$$;

ROLLBACK;
