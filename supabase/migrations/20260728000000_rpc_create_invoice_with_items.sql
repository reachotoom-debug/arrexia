-- ============================================================================
-- Atomic invoice create: insert header + line items in one transaction
-- ============================================================================
-- Replaces the non-atomic PostgREST sequence (INSERT invoice → INSERT items)
-- used by createInvoice. Any failure during header or item insert rolls back
-- the entire operation.

CREATE OR REPLACE FUNCTION public.rpc_create_invoice_with_items(
  p_workspace_id uuid,
  p_client_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_due_date date,
  p_po_number text,
  p_notes text,
  p_status text,
  p_payment_terms text,
  p_payment_terms_days integer,
  p_currency text,
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
  v_organization_id uuid;
  v_client public.clients%ROWTYPE;
  v_invoice_id uuid;
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

  IF p_workspace_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and client_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_invoice_number), '') IS NULL THEN
    RAISE EXCEPTION 'Invoice number is required'
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
    RAISE EXCEPTION 'Cannot create invoice for archived client'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_client.is_active IS FALSE THEN
    RAISE EXCEPTION 'Cannot create invoice for inactive client'
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

  INSERT INTO public.invoices (
    workspace_id,
    organization_id,
    client_id,
    invoice_number,
    issue_date,
    due_date,
    po_number,
    notes,
    status,
    payment_terms,
    payment_terms_days,
    currency,
    subtotal,
    discount_percent,
    discount_amount,
    tax_percent,
    tax_amount,
    amount
  )
  VALUES (
    p_workspace_id,
    v_organization_id,
    p_client_id,
    btrim(p_invoice_number),
    p_issue_date,
    p_due_date,
    p_po_number,
    p_notes,
    lower(p_status),
    p_payment_terms,
    p_payment_terms_days,
    COALESCE(NULLIF(btrim(p_currency), ''), 'USD'),
    p_subtotal,
    p_discount_percent,
    p_discount_amount,
    p_tax_percent,
    p_tax_amount,
    p_amount
  )
  RETURNING id INTO v_invoice_id;

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
      v_organization_id,
      v_invoice_id,
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
    'invoice_id', v_invoice_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_invoice_with_items(
  uuid, uuid, text, date, date, text, text, text, text, integer, text,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rpc_create_invoice_with_items(
  uuid, uuid, text, date, date, text, text, text, text, integer, text,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_create_invoice_with_items(
  uuid, uuid, text, date, date, text, text, text, text, integer, text,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_invoice_with_items(
  uuid, uuid, text, date, date, text, text, text, text, integer, text,
  numeric, numeric, numeric, numeric, numeric, numeric, jsonb
) IS
  'Atomically creates one invoice header and all line items. Requires auth.uid() workspace membership. Validates client workspace scope and active state. Money fields are supplied by the application server (calculateInvoiceMoney).';
