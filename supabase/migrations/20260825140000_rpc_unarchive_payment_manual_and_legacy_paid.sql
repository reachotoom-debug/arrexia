-- ============================================================================
-- Payment restore concurrency + legacy paid status delta fix
-- ============================================================================
-- PAY-001: rpc_unarchive_payment_manual — atomic restore with invoice FOR UPDATE
-- PAY-002: rpc_update_payment_manual — include legacy 'paid' in new_effective

-- ---------------------------------------------------------------------------
-- PAY-002: legacy paid status in update effective delta
-- ---------------------------------------------------------------------------

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

  v_old_effective := CASE
    WHEN v_payment.status IS NULL
      OR v_old_status IN ('completed', 'paid')
    THEN COALESCE(v_payment.net_amount, v_payment.amount)
    ELSE 0
  END;

  v_new_effective := CASE
    WHEN v_status IS NULL OR v_status IN ('completed', 'paid')
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
  'Atomically updates one manual payment. Locks invoice FOR UPDATE then payment FOR UPDATE. Validates effective paid delta (COALESCE(net_amount, amount)) for NULL/completed/paid statuses against invoices_view outstanding.';

-- ---------------------------------------------------------------------------
-- PAY-001: atomic payment restore
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_unarchive_payment_manual(
  p_workspace_id uuid,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_outstanding numeric;
  v_restore_effective numeric;
  v_payment_status text;
  v_tolerance constant numeric := 0.01;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a workspace member'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.invoice_id
  INTO v_invoice_id
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice_id IS NOT NULL THEN
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
  END IF;

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

  IF v_payment.archived_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'payment_id', p_payment_id,
      'already_unarchived', true,
      'invoice_id', v_payment.invoice_id,
      'client_id', v_payment.client_id
    );
  END IF;

  IF v_payment.invoice_id IS NOT NULL AND v_invoice_id IS NOT NULL
     AND v_payment.invoice_id IS DISTINCT FROM v_invoice_id THEN
    RAISE EXCEPTION 'Payment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.invoice_id IS NOT NULL THEN
    SELECT iv.outstanding
    INTO v_outstanding
    FROM public.invoices_view iv
    WHERE iv.id = v_payment.invoice_id
      AND iv.workspace_id = p_workspace_id
      AND iv.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found'
        USING ERRCODE = 'P0002';
    END IF;

    v_outstanding := COALESCE(v_outstanding, 0);

    v_payment_status := NULLIF(lower(btrim(COALESCE(v_payment.status, ''))), '');

    v_restore_effective := CASE
      WHEN v_payment.status IS NULL
        OR v_payment_status IN ('completed', 'paid')
      THEN COALESCE(v_payment.net_amount, v_payment.amount)
      ELSE 0
    END;

    IF v_restore_effective > v_outstanding + v_tolerance THEN
      RAISE EXCEPTION 'Restoring this payment would exceed the invoice outstanding balance.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.payments
  SET archived_at = NULL
  WHERE id = p_payment_id
    AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'already_unarchived', false,
    'invoice_id', v_payment.invoice_id,
    'client_id', v_payment.client_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_unarchive_payment_manual(uuid, uuid) IS
  'Atomically restores one archived payment. Locks invoice FOR UPDATE (when linked) then payment FOR UPDATE. Validates restore effective amount (COALESCE(net_amount, amount) for NULL/completed/paid) against invoices_view outstanding before clearing archived_at.';
