-- ============================================================================
-- Invoice edit paid-floor guard (F1)
-- ============================================================================
-- Rejects updating a partially paid invoice to a new total below effective
-- paid amount. Preserves rpc_update_invoice_with_items signature, security,
-- lock order, and all existing behavior.

CREATE OR REPLACE FUNCTION public.rpc_update_invoice_with_items(
  p_workspace_id uuid,
  p_invoice_id uuid,
  p_issue_date date,
  p_due_date date,
  p_po_number text,
  p_notes text,
  p_status text,
  p_payment_terms text,
  p_payment_terms_days integer,
  p_subtotal numeric,
  p_discount_percent numeric,
  p_discount_amount numeric,
  p_tax_percent numeric,
  p_tax_amount numeric,
  p_amount numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric;
  v_outstanding numeric;
  v_paid_total_tolerance constant numeric := 0.01;
  v_item jsonb;
  v_item_name text;
  v_item_qty numeric;
  v_item_unit_price numeric;
  v_item_description text;
  v_item_position integer;
  v_items_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and invoice_id are required'
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
    RAISE EXCEPTION 'Cannot edit an archived invoice. Unarchive it first.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0)
  INTO v_paid
  FROM public.payments p
  WHERE p.workspace_id = p_workspace_id
    AND p.invoice_id = p_invoice_id
    AND p.archived_at IS NULL
    AND (
      p.status IS NULL
      OR p.status = 'completed'
      OR p.status = 'paid'
    );

  v_outstanding := GREATEST(v_invoice.amount - COALESCE(v_paid, 0), 0);

  -- Match isInvoiceFullyPaid: outstanding <= 0.01
  IF v_outstanding <= v_paid_total_tolerance THEN
    RAISE EXCEPTION 'Cannot edit a fully paid invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Reject new total below effective paid (matches invoices_view paid semantics)
  IF p_amount < COALESCE(v_paid, 0) - v_paid_total_tolerance THEN
    RAISE EXCEPTION 'Invoice total cannot be less than the amount already paid.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'At least one line item is required'
      USING ERRCODE = '22023';
  END IF;

  v_items_count := jsonb_array_length(p_items);
  IF v_items_count < 1 THEN
    RAISE EXCEPTION 'At least one line item is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Due date is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL OR lower(p_status) NOT IN ('draft', 'sent', 'void') THEN
    RAISE EXCEPTION 'Invalid invoice status'
      USING ERRCODE = '22023';
  END IF;

  -- Validate line items before mutating
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_name := NULLIF(btrim(v_item->>'name'), '');
    v_item_qty := (v_item->>'quantity')::numeric;
    v_item_unit_price := (v_item->>'unit_price')::numeric;

    IF v_item_name IS NULL THEN
      RAISE EXCEPTION 'Item name is required'
        USING ERRCODE = '22023';
    END IF;

    IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than 0'
        USING ERRCODE = '22023';
    END IF;

    IF v_item_unit_price IS NULL OR v_item_unit_price < 0 THEN
      RAISE EXCEPTION 'Unit price cannot be negative'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.invoices
  SET
    issue_date = p_issue_date,
    due_date = p_due_date,
    po_number = p_po_number,
    notes = p_notes,
    status = lower(p_status),
    payment_terms = p_payment_terms,
    payment_terms_days = p_payment_terms_days,
    subtotal = p_subtotal,
    discount_percent = p_discount_percent,
    discount_amount = p_discount_amount,
    tax_percent = p_tax_percent,
    tax_amount = p_tax_amount,
    amount = p_amount,
    updated_at = now()
  WHERE id = p_invoice_id
    AND workspace_id = p_workspace_id;

  DELETE FROM public.invoice_items
  WHERE invoice_id = p_invoice_id;

  v_item_position := 1;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_name := NULLIF(btrim(v_item->>'name'), '');
    v_item_description := NULLIF(btrim(v_item->>'description'), '');
    v_item_qty := (v_item->>'quantity')::numeric;
    v_item_unit_price := (v_item->>'unit_price')::numeric;

    INSERT INTO public.invoice_items (
      organization_id,
      invoice_id,
      name,
      description,
      quantity,
      unit_price,
      position
    )
    VALUES (
      v_invoice.organization_id,
      p_invoice_id,
      v_item_name,
      v_item_description,
      v_item_qty,
      v_item_unit_price,
      COALESCE((v_item->>'position')::integer, v_item_position)
    );

    v_item_position := v_item_position + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_update_invoice_with_items(
  uuid, uuid, date, date, text, text, text, text, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rpc_update_invoice_with_items(
  uuid, uuid, date, date, text, text, text, text, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_update_invoice_with_items(
  uuid, uuid, date, date, text, text, text, text, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_invoice_with_items(
  uuid, uuid, date, date, text, text, text, text, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) IS
  'Atomically updates one invoice header and replaces all line items. Requires auth.uid() workspace membership. Rejects archived and fully-paid invoices (outstanding <= 0.01). Rejects new total below effective paid (0.01 tolerance). Money fields are supplied by the application server (calculateInvoiceMoney).';
