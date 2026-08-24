-- ============================================================================
-- STAGING / LOCAL ONLY — NEVER RUN ON PRODUCTION
-- Integration: rpc_create_payment_manual + rpc_update_payment_manual invariants
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/rpcCreatePaymentManualConcurrency.integration.sql
-- Requires: migration 20260825120000_rpc_create_payment_manual.sql applied
--
-- NOTE: Sequential assertions below do NOT prove parallel session behavior by themselves.
-- See TWO-SESSION PARALLEL CONCURRENCY TEST at the bottom of this file.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_workspace_id uuid := gen_random_uuid();
  v_other_workspace_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_inactive_client_id uuid := gen_random_uuid();
  v_other_client_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_other_invoice_id uuid := gen_random_uuid();
  v_draft_invoice_id uuid := gen_random_uuid();
  v_result jsonb;
  v_payment_count integer;
  v_outstanding numeric;
  v_payment_a_id uuid;
  v_payment_b_id uuid;
  v_payment_completed_id uuid;
  v_payment_pending_id uuid;
  v_payment_failed_id uuid;
  v_payment_refunded_id uuid;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_user_id, 'rpc-manual-pay-test@example.com', crypt('test', gen_salt('bf')), now(), now(), now());

  INSERT INTO public.organizations (id, name) VALUES (v_org_id, 'Manual Pay Concurrency Org');

  INSERT INTO public.workspaces (id, organization_id, name)
  VALUES
    (v_workspace_id, v_org_id, 'Manual Pay Workspace'),
    (v_other_workspace_id, v_org_id, 'Other Workspace');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  INSERT INTO public.clients (id, workspace_id, organization_id, name, email, is_active)
  VALUES
    (v_client_id, v_workspace_id, v_org_id, 'Active Client', 'active-pay@example.com', true),
    (v_inactive_client_id, v_workspace_id, v_org_id, 'Inactive Client', 'inactive-pay@example.com', false),
    (v_other_client_id, v_other_workspace_id, v_org_id, 'Other Client', 'other-pay@example.com', true);

  INSERT INTO public.invoices (
    id, workspace_id, organization_id, client_id, invoice_number,
    issue_date, due_date, status, currency, amount
  )
  VALUES
    (v_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-PAY-1000',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 1000),
    (v_other_invoice_id, v_other_workspace_id, v_org_id, v_other_client_id, 'INV-OTHER-1',
     CURRENT_DATE, CURRENT_DATE + 30, 'sent', 'USD', 500),
    (v_draft_invoice_id, v_workspace_id, v_org_id, v_client_id, 'INV-DRAFT-1',
     CURRENT_DATE, CURRENT_DATE + 30, 'draft', 'USD', 200);

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Partial payment succeeds
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    400, CURRENT_DATE, 'bank_transfer', 'completed',
    NULL, NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'partial payment failed: %', v_result;
  END IF;

  SELECT outstanding INTO v_outstanding
  FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 600 THEN
    RAISE EXCEPTION 'partial payment outstanding expected 600 got %', v_outstanding;
  END IF;

  -- Exact outstanding payment succeeds
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    600, CURRENT_DATE, 'bank_transfer', 'completed',
    NULL, NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'full payment failed: %', v_result;
  END IF;

  SELECT outstanding INTO v_outstanding
  FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 0 THEN
    RAISE EXCEPTION 'fully paid outstanding expected 0 got %', v_outstanding;
  END IF;

  -- Over outstanding rejected on fully paid invoice
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_client_id, v_invoice_id,
      1, CURRENT_DATE, 'cash', 'completed',
      NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected fully paid rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%no outstanding balance%' AND SQLERRM NOT LIKE '%exceeds the invoice outstanding%' THEN
      RAISE;
    END IF;
  END;

  -- Reset invoice for concurrency scenario
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;

  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 1000 THEN
    RAISE EXCEPTION 'reset outstanding expected 1000 got %', v_outstanding;
  END IF;

  -- First completed $700 succeeds
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-CONCURRENT-A', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'first concurrent payment failed';
  END IF;

  -- second completed payment must fail (outstanding now 300)
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_client_id, v_invoice_id,
      700, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-CONCURRENT-B', NULL, NULL
    );
    RAISE EXCEPTION 'second completed payment must fail overpay';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%exceeds the invoice outstanding balance%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_payment_count
  FROM public.payments
  WHERE invoice_id = v_invoice_id AND archived_at IS NULL;
  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'expected one completed payment after overpay rejection, got %', v_payment_count;
  END IF;

  -- pending payments may both record when each amount <= current outstanding (non-counting semantics)
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;

  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'pending',
    'TXN-PENDING-A', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'first pending payment failed';
  END IF;

  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'pending',
    'TXN-PENDING-B', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'second pending payment failed';
  END IF;

  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 1000 THEN
    RAISE EXCEPTION 'pending payments must not reduce outstanding; got %', v_outstanding;
  END IF;

  -- UPDATE: pending A -> completed within capacity succeeds
  SELECT id INTO v_payment_a_id
  FROM public.payments
  WHERE invoice_id = v_invoice_id AND transaction_id = 'TXN-PENDING-A';

  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_a_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-PENDING-A', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'pending A -> completed failed: %', v_result;
  END IF;

  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 300 THEN
    RAISE EXCEPTION 'after pending A completed outstanding expected 300 got %', v_outstanding;
  END IF;

  -- UPDATE: pending B -> completed over capacity must fail
  SELECT id INTO v_payment_b_id
  FROM public.payments
  WHERE invoice_id = v_invoice_id AND transaction_id = 'TXN-PENDING-B';

  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_b_id, v_client_id, v_invoice_id,
      700, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-PENDING-B', NULL, NULL
    );
    RAISE EXCEPTION 'pending B must fail over capacity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%would result in overpayment%' THEN
      RAISE;
    END IF;
  END;

  -- failed -> completed protected
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-BASE', NULL, NULL
  );
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    400, CURRENT_DATE, 'bank_transfer', 'failed',
    'TXN-FAILED', NULL, NULL
  );
  SELECT id INTO v_payment_failed_id FROM public.payments WHERE transaction_id = 'TXN-FAILED';
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_failed_id, v_client_id, v_invoice_id,
      400, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-FAILED', NULL, NULL
    );
    RAISE EXCEPTION 'failed -> completed over capacity must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%would result in overpayment%' THEN
      RAISE;
    END IF;
  END;

  -- refunded -> completed protected
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-BASE-2', NULL, NULL
  );
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    400, CURRENT_DATE, 'bank_transfer', 'refunded',
    'TXN-REFUNDED', NULL, NULL
  );
  SELECT id INTO v_payment_refunded_id FROM public.payments WHERE transaction_id = 'TXN-REFUNDED';
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_refunded_id, v_client_id, v_invoice_id,
      400, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-REFUNDED', NULL, NULL
    );
    RAISE EXCEPTION 'refunded -> completed over capacity must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%would result in overpayment%' THEN
      RAISE;
    END IF;
  END;

  -- completed amount increase within capacity succeeds
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-AMT-UP', NULL, NULL
  );
  SELECT id INTO v_payment_completed_id FROM public.payments WHERE transaction_id = 'TXN-AMT-UP';
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
    900, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-AMT-UP', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'completed amount increase within capacity failed';
  END IF;

  -- completed amount increase beyond capacity fails
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
      1100, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-AMT-UP', NULL, NULL
    );
    RAISE EXCEPTION 'completed amount increase beyond capacity must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%would result in overpayment%' THEN
      RAISE;
    END IF;
  END;

  -- completed amount decrease succeeds
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
    500, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-AMT-UP', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'completed amount decrease failed';
  END IF;

  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 500 THEN
    RAISE EXCEPTION 'after amount decrease outstanding expected 500 got %', v_outstanding;
  END IF;

  -- completed -> pending reduces effective paid
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
    500, CURRENT_DATE, 'bank_transfer', 'pending',
    'TXN-AMT-UP', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'completed -> pending failed';
  END IF;
  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 1000 THEN
    RAISE EXCEPTION 'completed -> pending outstanding expected 1000 got %', v_outstanding;
  END IF;

  -- status + amount changed together (pending 500 -> completed 300)
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
    300, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-AMT-UP', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'status+amount combined update failed';
  END IF;
  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 700 THEN
    RAISE EXCEPTION 'combined update outstanding expected 700 got %', v_outstanding;
  END IF;

  -- create vs update serialization: pending payment + concurrent completed create
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'pending',
    'TXN-MIX-PENDING', NULL, NULL
  );
  SELECT id INTO v_payment_pending_id FROM public.payments WHERE transaction_id = 'TXN-MIX-PENDING';
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-MIX-COMPLETED', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'create completed while pending exists failed';
  END IF;
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_pending_id, v_client_id, v_invoice_id,
      700, CURRENT_DATE, 'bank_transfer', 'completed',
      'TXN-MIX-PENDING', NULL, NULL
    );
    RAISE EXCEPTION 'pending -> completed after create completed must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%would result in overpayment%' THEN
      RAISE;
    END IF;
  END;

  -- wrong workspace on update rejected
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    100, CURRENT_DATE, 'cash', 'completed',
    'TXN-WS-1', NULL, NULL
  );
  SELECT id INTO v_payment_completed_id FROM public.payments WHERE transaction_id = 'TXN-WS-1';
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_other_workspace_id, v_payment_completed_id, v_client_id, v_invoice_id,
      100, CURRENT_DATE, 'cash', 'completed',
      'TXN-WS-1', NULL, NULL
    );
    RAISE EXCEPTION 'expected wrong workspace update rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Payment not found%' AND SQLERRM NOT LIKE '%Not a workspace member%' THEN
      RAISE;
    END IF;
  END;

  -- duplicate transaction reference on update rejected
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    100, CURRENT_DATE, 'cash', 'completed',
    'TXN-DUP-A', NULL, NULL
  );
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    100, CURRENT_DATE, 'cash', 'completed',
    'TXN-DUP-B', NULL, NULL
  );
  SELECT id INTO v_payment_a_id FROM public.payments WHERE transaction_id = 'TXN-DUP-A';
  SELECT id INTO v_payment_b_id FROM public.payments WHERE transaction_id = 'TXN-DUP-B';
  BEGIN
    PERFORM public.rpc_update_payment_manual(
      v_workspace_id, v_payment_b_id, v_client_id, v_invoice_id,
      100, CURRENT_DATE, 'cash', 'completed',
      'TXN-DUP-A', NULL, NULL
    );
    RAISE EXCEPTION 'expected duplicate transaction reference on update';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%transaction reference already exists%' THEN
      RAISE;
    END IF;
  END;

  -- net_amount effective amount semantics (matches invoices_view COALESCE(net_amount, amount))
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  INSERT INTO public.payments (
    id, organization_id, workspace_id, client_id, invoice_id,
    amount, net_amount, transaction_fee, payment_date, method, status, currency
  )
  VALUES (
    gen_random_uuid(), v_org_id, v_workspace_id, v_client_id, v_invoice_id,
    1000, 980, 20, CURRENT_DATE, 'bank_transfer', 'completed', 'USD'
  );
  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 20 THEN
    RAISE EXCEPTION 'net_amount payment outstanding expected 20 got %', v_outstanding;
  END IF;
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_client_id, v_invoice_id,
      30, CURRENT_DATE, 'cash', 'completed',
      'TXN-NET-OVER', NULL, NULL
    );
    RAISE EXCEPTION 'create beyond net_amount-adjusted outstanding must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%exceeds the invoice outstanding balance%' THEN
      RAISE;
    END IF;
  END;

  -- same payment stale old state: second update re-reads completed state (idempotent, no double-count)
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'pending',
    'TXN-STALE-SAME', NULL, NULL
  );
  SELECT id INTO v_payment_pending_id FROM public.payments WHERE transaction_id = 'TXN-STALE-SAME';
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_pending_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-STALE-SAME', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'first pending->completed failed';
  END IF;
  v_result := public.rpc_update_payment_manual(
    v_workspace_id, v_payment_pending_id, v_client_id, v_invoice_id,
    700, CURRENT_DATE, 'bank_transfer', 'completed',
    'TXN-STALE-SAME', NULL, NULL
  );
  IF (v_result->>'payment_id') IS NULL THEN
    RAISE EXCEPTION 'idempotent second update on same payment failed';
  END IF;
  SELECT outstanding INTO v_outstanding FROM public.invoices_view WHERE id = v_invoice_id;
  IF v_outstanding <> 300 THEN
    RAISE EXCEPTION 'same payment must not double-count; outstanding expected 300 got %', v_outstanding;
  END IF;

  -- duplicate transaction reference rejected (create)
  DELETE FROM public.payments WHERE invoice_id = v_invoice_id;
  v_result := public.rpc_create_payment_manual(
    v_workspace_id, v_client_id, v_invoice_id,
    100, CURRENT_DATE, 'cash', 'completed',
    'TXN-DUP-1', NULL, NULL
  );
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_client_id, v_invoice_id,
      100, CURRENT_DATE, 'cash', 'completed',
      'TXN-DUP-1', NULL, NULL
    );
    RAISE EXCEPTION 'expected duplicate transaction reference rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%transaction reference already exists%' THEN
      RAISE;
    END IF;
  END;

  -- wrong client/invoice relationship
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_other_client_id, v_invoice_id,
      50, CURRENT_DATE, 'cash', 'completed',
      NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected wrong client rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%does not belong to selected client%' THEN
      RAISE;
    END IF;
  END;

  -- inactive client rejected
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_inactive_client_id, v_invoice_id,
      50, CURRENT_DATE, 'cash', 'completed',
      NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected inactive client rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%inactive client%' THEN
      RAISE;
    END IF;
  END;

  -- draft invoice rejected
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_client_id, v_draft_invoice_id,
      50, CURRENT_DATE, 'cash', 'completed',
      NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected draft invoice rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%draft invoice%' THEN
      RAISE;
    END IF;
  END;

  -- cross-workspace invoice rejected (not a member / not found)
  BEGIN
    PERFORM public.rpc_create_payment_manual(
      v_workspace_id, v_other_client_id, v_other_invoice_id,
      50, CURRENT_DATE, 'cash', 'completed',
      NULL, NULL, NULL
    );
    RAISE EXCEPTION 'expected cross-workspace rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%does not belong%' AND SQLERRM NOT LIKE '%Invoice not found%' AND SQLERRM NOT LIKE '%Client not found%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;

-- ============================================================================
-- TWO-SESSION PARALLEL CONCURRENCY TEST (manual; staging/local only)
-- ============================================================================
-- Sequential assertions above do NOT prove parallel session behavior.
-- Use two psql sessions against the same staging DB with real invoice/payment IDs.
--
-- Setup (session 0 — run once, note IDs):
--   INSERT workspace/client/invoice ($1000) + two pending $700 payments A and B.
--
-- Session 1:
--   BEGIN;
--   SELECT public.rpc_update_payment_manual(
--     :workspace_id, :payment_a_id, :client_id, :invoice_id,
--     700, CURRENT_DATE, 'bank_transfer', 'completed', 'TXN-PAR-A', NULL, NULL
--   );
--   -- hold before COMMIT (e.g. SELECT pg_sleep(30);)
--
-- Session 2 (while session 1 open):
--   BEGIN;
--   SELECT public.rpc_update_payment_manual(
--     :workspace_id, :payment_b_id, :client_id, :invoice_id,
--     700, CURRENT_DATE, 'bank_transfer', 'completed', 'TXN-PAR-B', NULL, NULL
--   );
--
-- Expected:
--   - Session 1 COMMIT succeeds; outstanding becomes 300.
--   - Session 2 blocks on invoice FOR UPDATE until session 1 commits, then FAILS
--     with "would result in overpayment" (or must ROLLBACK if already errored).
--   - Final effective completed total <= 1000 (+0.01 tolerance).
--
-- Variation (create vs update):
--   Session 1: rpc_update_payment_manual pending->completed $700 (hold txn open)
--   Session 2: rpc_create_payment_manual completed $700
-- Variation (same payment, two sessions — stale old-state protection):
--   Setup: one pending $700 payment on $1000 invoice.
--   Session 1: rpc_update_payment_manual pending->completed $700; hold txn open.
--   Session 2: rpc_update_payment_manual same payment pending->completed $700.
--   Session 1 COMMIT first.
--   Session 2 must re-read payment AFTER invoice lock and must NOT apply a second +700 delta.
--   Expected final outstanding: 300 (not 0 from double-counting the same payment).
-- ============================================================================
