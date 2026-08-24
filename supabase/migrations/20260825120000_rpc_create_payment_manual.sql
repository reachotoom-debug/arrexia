-- ============================================================================
-- Manual payment mutations: concurrency-safe Record Payment + Edit Payment
-- ============================================================================
-- Replaces read-outstanding → validate → mutate in createPayment/updatePayment
-- with single transactions that lock the invoice row (FOR UPDATE) and validate
-- against authoritative invoices_view outstanding before insert/update.

CREATE OR REPLACE FUNCTION public.rpc_create_payment_manual(
  p_workspace_id uuid,
  p_client_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_status text,
  p_transaction_id text,
  p_notes text,
  p_payment_provider text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_organization_id uuid;
  v_outstanding numeric;
  v_base_status text;
  v_currency text;
  v_payment_id uuid;
  v_tolerance constant numeric := 0.01;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_client_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id, client_id, and invoice_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment_date is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a workspace member'
      USING ERRCODE = '42501';
  END IF;

  SELECT w.organization_id
  INTO v_organization_id
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Workspace organization not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT i.*
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create payment for archived invoice'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Selected invoice does not belong to selected client.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.*
  INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id
    AND c.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_client.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create payment for archived client'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_client.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot create payment for inactive client'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT iv.outstanding, iv.base_status, iv.currency
  INTO v_outstanding, v_base_status, v_currency
  FROM public.invoices_view iv
  WHERE iv.id = p_invoice_id
    AND iv.workspace_id = p_workspace_id;

  IF v_base_status = 'void' THEN
    RAISE EXCEPTION 'Cannot create payment for void invoice'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_base_status = 'draft' THEN
    RAISE EXCEPTION 'Cannot create payment for draft invoice. Invoice must be sent first.'
      USING ERRCODE = 'P0001';
  END IF;

  v_outstanding := COALESCE(v_outstanding, 0);

  IF v_outstanding <= v_tolerance THEN
    RAISE EXCEPTION 'Invoice has no outstanding balance (%). Cannot record payment.', to_char(v_outstanding, 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount > v_outstanding + v_tolerance THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds the invoice outstanding balance (%). Please enter an amount less than or equal to %.',
      to_char(p_amount, 'FM999999990.00'),
      to_char(v_outstanding, 'FM999999990.00'),
      to_char(v_outstanding, 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  v_status := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');

  INSERT INTO public.payments (
    organization_id,
    workspace_id,
    client_id,
    invoice_id,
    amount,
    payment_date,
    method,
    status,
    transaction_id,
    notes,
    payment_provider,
    currency
  )
  VALUES (
    v_organization_id,
    p_workspace_id,
    p_client_id,
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_method,
    v_status,
    NULLIF(btrim(COALESCE(p_transaction_id, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_payment_provider, '')), ''),
    COALESCE(NULLIF(btrim(v_currency), ''), 'USD')
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A payment with this transaction reference already exists in this workspace.'
      USING ERRCODE = '23505';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_payment_manual(
  uuid, uuid, uuid, numeric, date, text, text, text, text, text
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rpc_create_payment_manual(
  uuid, uuid, uuid, numeric, date, text, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_payment_manual(
  uuid, uuid, uuid, numeric, date, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_payment_manual(
  uuid, uuid, uuid, numeric, date, text, text, text, text, text
) IS
  'Atomically records one manual payment against an invoice. Locks invoice FOR UPDATE, validates against invoices_view outstanding, enforces tenant/client/invoice guards matching createPayment.';

-- ============================================================================
-- Manual payment update: concurrency-safe Edit Payment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual(
  p_workspace_id uuid,
  p_payment_id uuid,
  p_client_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_status text,
  p_transaction_id text,
  p_notes text,
  p_payment_provider text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_payment public.payments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_outstanding numeric;
  v_old_effective numeric;
  v_new_effective numeric;
  v_effective_delta numeric;
  v_new_outstanding numeric;
  v_tolerance constant numeric := 0.01;
  v_status text;
  v_old_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_payment_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and payment_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment_date is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a workspace member'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve invoice identity only (no payment row lock yet).
  SELECT p.invoice_id
  INTO v_invoice_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invalid payment: missing invoice_id'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock invoice first (shared serialization point with rpc_create_payment_manual).
  SELECT i.*
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = v_invoice_id
    AND i.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Re-read and lock payment after invoice lock (prevents stale old-state deltas).
  SELECT p.*
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.invoice_id IS DISTINCT FROM v_invoice_id THEN
    RAISE EXCEPTION 'Payment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_client_id IS NOT NULL AND v_payment.client_id IS NOT NULL AND v_payment.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cannot change client for an existing payment'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_invoice_id IS NOT NULL AND v_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'Cannot change invoice for an existing payment'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT iv.outstanding
  INTO v_outstanding
  FROM public.invoices_view iv
  WHERE iv.id = v_invoice_id
    AND iv.workspace_id = p_workspace_id
    AND iv.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_outstanding := COALESCE(v_outstanding, 0);

  v_old_status := NULLIF(lower(btrim(COALESCE(v_payment.status, ''))), '');
  v_status := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');

  -- Match invoices_view paid semantics: COALESCE(net_amount, amount).
  -- Manual update only mutates amount; an existing non-null net_amount remains authoritative.
  v_old_effective := CASE
    WHEN v_payment.status IS NULL
      OR v_old_status IN ('completed', 'paid')
    THEN COALESCE(v_payment.net_amount, v_payment.amount)
    ELSE 0
  END;

  v_new_effective := CASE
    WHEN v_status IS NULL OR v_status = 'completed'
    THEN COALESCE(v_payment.net_amount, p_amount)
    ELSE 0
  END;

  v_effective_delta := v_new_effective - v_old_effective;
  v_new_outstanding := v_outstanding - v_effective_delta;

  IF v_new_outstanding < -v_tolerance THEN
    RAISE EXCEPTION
      'Updating this payment would result in overpayment. Current outstanding: %, payment change: %.',
      to_char(v_outstanding, 'FM999999990.00'),
      CASE
        WHEN v_effective_delta >= 0 THEN '+' || to_char(v_effective_delta, 'FM999999990.00')
        ELSE to_char(v_effective_delta, 'FM999999990.00')
      END
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET
    amount = p_amount,
    payment_date = p_payment_date,
    method = p_method,
    status = v_status,
    transaction_id = NULLIF(btrim(COALESCE(p_transaction_id, '')), ''),
    notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
    payment_provider = NULLIF(btrim(COALESCE(p_payment_provider, '')), '')
  WHERE id = p_payment_id
    AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A payment with this transaction reference already exists in this workspace.'
      USING ERRCODE = '23505';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_update_payment_manual(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, text
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rpc_update_payment_manual(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_update_payment_manual(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_payment_manual(
  uuid, uuid, uuid, uuid, numeric, date, text, text, text, text, text
) IS
  'Atomically updates one manual payment. Locks invoice FOR UPDATE then payment FOR UPDATE, re-reads payment after invoice lock, validates effective paid delta (COALESCE(net_amount, amount)) against invoices_view outstanding.';
