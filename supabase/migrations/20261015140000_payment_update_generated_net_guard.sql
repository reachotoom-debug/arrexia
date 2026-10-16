-- LOCAL REVIEW CANDIDATE: prerequisites must be checked against the target schema.
-- The deployed net_amount expression was reported as GENERATED ALWAYS STORED
-- (amount - transaction_fee). Fees are unchanged; nullable net falls back to gross,
-- exactly as invoices_view does. No generated-column writes or accounting changes.
-- Signed total - paid avoids hiding existing excess behind clipped outstanding.
-- Existing excess can be reduced or retained, but never increased by this edit.
-- This does not identify or repair the historical source of any overpayment.
DO $$
DECLARE v_generated "char"; v_expression text;
BEGIN
  SELECT a.attgenerated, pg_get_expr(d.adbin,d.adrelid)
    INTO v_generated,v_expression
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.payments'::regclass AND a.attname='net_amount' AND NOT a.attisdropped;
  IF v_generated IS DISTINCT FROM 's' OR regexp_replace(v_expression,'[()[:space:]]','','g') IS DISTINCT FROM 'amount-transaction_fee' THEN
    RAISE EXCEPTION 'Payment update guard requires stored generated net_amount = amount - transaction_fee';
  END IF;
END;
$$;
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

  SELECT iv.total - iv.paid
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


  v_status := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');

  v_old_effective := CASE
    WHEN v_payment.archived_at IS NULL
      AND (v_payment.status IS NULL OR v_payment.status IN ('completed', 'paid'))
    THEN COALESCE(v_payment.net_amount, v_payment.amount)
    ELSE 0
  END;

  v_new_effective := CASE
    WHEN v_payment.archived_at IS NULL
      AND (v_status IS NULL OR v_status IN ('completed', 'paid'))
    THEN COALESCE(p_amount - v_payment.transaction_fee, p_amount)
    ELSE 0
  END;

  v_effective_delta := v_new_effective - v_old_effective;
  v_new_outstanding := v_outstanding - v_effective_delta;

  IF v_new_outstanding < -v_tolerance AND v_effective_delta > 0 THEN
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
  'Atomically updates one manual payment. Locks invoice FOR UPDATE then payment FOR UPDATE. Predicts generated net (amount - transaction_fee), excludes archived contributions, and checks signed canonical capacity. Existing overpayment permits only non-increasing effective contribution.';


