-- ============================================================================
-- Invoice import client resolution hardening
-- ============================================================================
-- Aligns authoritative RPC with UI preview contract: clients must already exist
-- as active (non-archived) records in the same workspace. Removes auto-create.
-- Missing, archived, ambiguous, or cross-workspace clients fail before writes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
DECLARE
  v_errors jsonb := '[]'::jsonb;

  v_created_clients int := 0;
  v_created_invoices int := 0;
  v_created_items int := 0;

  v_row jsonb;
  v_rt text;
  v_inv text;

  v_client_id uuid;
  v_client_count int;
  v_invoice_id uuid;
  v_existing_invoice_id uuid;

  v_invoice_ids jsonb := '{}'::jsonb;
  v_subtotal numeric;
  v_new_total numeric;
  v_effective_paid numeric;
  v_item_position integer;

  v_org_id uuid;
  v_has_org_id boolean;

  v_default_currency char(3) := 'USD';
  v_currency text;

  v_invoice_numbers_seen jsonb := '{}'::jsonb;

  v_paid_total_tolerance constant numeric := 0.01;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  SELECT organization_id INTO v_org_id
  FROM public.workspaces
  WHERE id = p_workspace_id
  LIMIT 1;

  IF v_has_org_id AND v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace is missing organization_id. Please contact support to configure your workspace.')
    );
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('p_rows must be a JSON array'));
  END IF;

  -- Validate (first pass: detect duplicates and validate fields)
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt NOT IN ('invoice','item') THEN
      v_errors := v_errors || jsonb_build_array(format('Invalid row_type "%s" (invoice_number=%s)', v_rt, v_inv));
      CONTINUE;
    END IF;

    IF v_inv = '' THEN
      v_errors := v_errors || jsonb_build_array('Missing invoice_number');
      CONTINUE;
    END IF;

    IF v_rt = 'invoice' THEN
      IF v_invoice_numbers_seen ? v_inv THEN
        v_errors := v_errors || jsonb_build_array(format('Duplicate invoice_number in file: %s', v_inv));
      ELSE
        v_invoice_numbers_seen := v_invoice_numbers_seen || jsonb_build_object(v_inv, 1);
      END IF;

      IF COALESCE(v_row->>'issue_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing issue_date for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'due_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing due_date for %s', v_inv));
      END IF;

      IF COALESCE(v_row->>'currency','') <> '' THEN
        DECLARE
          v_currency text := UPPER(TRIM(COALESCE(v_row->>'currency','')));
        BEGIN
          IF LENGTH(v_currency) <> 3 OR v_currency !~ '^[A-Z]{3}$' THEN
            v_errors := v_errors || jsonb_build_array(format('Invalid currency "%s" for %s (must be a 3-letter ISO code like USD, EUR, etc.)', v_row->>'currency', v_inv));
          END IF;
        END;
      END IF;

      IF LOWER(COALESCE(v_row->>'status','')) NOT IN ('draft','sent','void') THEN
        v_errors := v_errors || jsonb_build_array(format('Invalid status "%s" for %s (allowed Draft/Sent/Void)', COALESCE(v_row->>'status',''), v_inv));
      END IF;

      IF COALESCE(v_row->>'client_email','') = '' AND COALESCE(v_row->>'client_name','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing client_email or client_name for %s', v_inv));
      END IF;
    END IF;

    IF v_rt = 'item' THEN
      IF COALESCE(v_row->>'item_description','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing item_description for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'quantity','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing quantity for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'unit_price','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing unit_price for %s', v_inv));
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  -- Paid-total guard: block re-import that would leave effective paid above new total
  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(p_rows) AS t(value)
    WHERE LOWER(COALESCE(value->>'row_type', '')) = 'invoice'
  LOOP
    v_inv := COALESCE(v_row->>'invoice_number', '');
    v_existing_invoice_id := NULL;
    v_currency := NULL;

    SELECT COALESCE(SUM((elem->>'quantity')::numeric * (elem->>'unit_price')::numeric), 0)
    INTO v_new_total
    FROM jsonb_array_elements(p_rows) AS elem
    WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'item'
      AND COALESCE(elem->>'invoice_number', '') = v_inv;

    SELECT i.id, COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'), 3)), ''), i.currency::text)
    INTO v_existing_invoice_id, v_currency
    FROM public.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.invoice_number = v_inv
      AND i.archived_at IS NULL
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      SELECT COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0)
      INTO v_effective_paid
      FROM public.payments p
      WHERE p.invoice_id = v_existing_invoice_id
        AND p.archived_at IS NULL
        AND (
          p.status IS NULL
          OR p.status = 'completed'
          OR p.status = 'paid'
        );

      IF v_effective_paid > v_new_total + v_paid_total_tolerance THEN
        v_errors := v_errors || jsonb_build_array(
          format(
            'Invoice %s cannot be updated to %s %s because %s %s has already been paid.',
            v_inv,
            COALESCE(v_currency, v_default_currency::text),
            to_char(v_new_total, 'FM999,999,990.00'),
            COALESCE(v_currency, v_default_currency::text),
            to_char(v_effective_paid, 'FM999,999,990.00')
          )
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients', 0, 'invoices', 0, 'items', 0)
    );
  END IF;

  -- Client resolution (dry-run + execute): existing active workspace clients only
  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(p_rows) AS t(value)
    WHERE LOWER(COALESCE(value->>'row_type', '')) = 'invoice'
  LOOP
    v_inv := COALESCE(v_row->>'invoice_number', '');
    v_client_id := NULL;

    IF COALESCE(v_row->>'client_email','') <> '' THEN
      SELECT id INTO v_client_id
      FROM public.clients
      WHERE workspace_id = p_workspace_id
        AND archived_at IS NULL
        AND LOWER(TRIM(email)) = LOWER(TRIM(v_row->>'client_email'))
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
      SELECT COUNT(*) INTO v_client_count
      FROM public.clients
      WHERE workspace_id = p_workspace_id
        AND archived_at IS NULL
        AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'));

      IF v_client_count > 1 THEN
        v_errors := v_errors || jsonb_build_array(format('Multiple clients match name "%s" for %s. Use client_email or unique identifier.', v_row->>'client_name', v_inv));
      ELSIF v_client_count = 1 THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'))
        LIMIT 1;
      END IF;
    END IF;

    IF v_client_id IS NULL THEN
      v_errors := v_errors || jsonb_build_array(format('Client not found for %s', v_inv));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients', 0, 'invoices', 0, 'items', 0)
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'errors', '[]'::jsonb,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  -- Execute: invoice headers first
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'invoice' THEN
      v_client_id := NULL;

      IF COALESCE(v_row->>'client_email','') <> '' THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(email)) = LOWER(TRIM(v_row->>'client_email'))
        LIMIT 1;
      END IF;

      IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
        SELECT COUNT(*) INTO v_client_count
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'));

        IF v_client_count > 1 THEN
          v_errors := v_errors || jsonb_build_array(format('Multiple clients match name "%s" for %s. Use client_email or unique identifier.', v_row->>'client_name', v_inv));
        ELSIF v_client_count = 1 THEN
          SELECT id INTO v_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'))
          LIMIT 1;
        END IF;
      END IF;

      IF v_client_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Client not found for %s', v_inv));
        CONTINUE;
      END IF;

      v_invoice_id := NULL;
      v_existing_invoice_id := NULL;

      SELECT id INTO v_existing_invoice_id
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = v_inv
        AND archived_at IS NULL
      LIMIT 1;

      IF v_existing_invoice_id IS NOT NULL THEN
        UPDATE public.invoices
        SET
          client_id = v_client_id,
          issue_date = (v_row->>'issue_date')::date,
          due_date = (v_row->>'due_date')::date,
          currency = COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
          status = LOWER(TRIM(v_row->>'status')),
          po_number = NULLIF(v_row->>'po_number',''),
          notes = NULLIF(v_row->>'notes',''),
          updated_at = NOW()
        WHERE id = v_existing_invoice_id
          AND workspace_id = p_workspace_id
        RETURNING id INTO v_invoice_id;
      ELSE
        IF EXISTS (
          SELECT 1
          FROM public.invoices i
          WHERE i.workspace_id = p_workspace_id
            AND i.invoice_number = v_inv
            AND i.archived_at IS NOT NULL
        ) THEN
          v_errors := v_errors || jsonb_build_array(format('Invoice is archived: %s', v_inv));
          CONTINUE;
        END IF;

        INSERT INTO public.invoices (
          workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
          amount
        )
        VALUES (
          p_workspace_id,
          CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
          v_client_id,
          v_inv,
          (v_row->>'issue_date')::date,
          (v_row->>'due_date')::date,
          COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
          LOWER(TRIM(v_row->>'status')),
          NULLIF(v_row->>'po_number',''),
          NULLIF(v_row->>'notes',''),
          0
        )
        RETURNING id INTO v_invoice_id;

        v_created_invoices := v_created_invoices + 1;
      END IF;

      IF v_invoice_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Failed to persist invoice header for %s', v_inv));
        CONTINUE;
      END IF;

      IF NOT (v_invoice_ids ? v_inv) THEN
        v_invoice_ids := v_invoice_ids || jsonb_build_object(v_inv, v_invoice_id::text);
      ELSE
        v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      END IF;
    END IF;
  END LOOP;

  -- Validate item rows reference known invoice headers before mutation
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'item' AND NOT (v_invoice_ids ? v_inv) THEN
      v_errors := v_errors || jsonb_build_array(format('Item row references invoice_number "%s" which does not exist in this file', v_inv));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'invoice_import_failed'
      USING ERRCODE = 'P0001',
            DETAIL = v_errors::text;
  END IF;

  -- Replace items once per invoice, then insert ALL items for that invoice
  FOR v_inv, v_invoice_id IN SELECT key, value FROM jsonb_each_text(v_invoice_ids)
  LOOP
    DELETE FROM public.invoice_items WHERE invoice_id = (v_invoice_id::uuid);
    v_item_position := 1;

    FOR v_row IN
      SELECT elem
      FROM jsonb_array_elements(p_rows) AS elem
      WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'item'
        AND COALESCE(elem->>'invoice_number', '') = v_inv
    LOOP
      IF v_has_org_id THEN
        INSERT INTO public.invoice_items (
          organization_id, invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          v_org_id,
          (v_invoice_id::uuid),
          TRIM(v_row->>'item_description'),
          NULL,
          (v_row->>'quantity')::numeric,
          (v_row->>'unit_price')::numeric,
          v_item_position
        );
      ELSE
        INSERT INTO public.invoice_items (
          invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          (v_invoice_id::uuid),
          TRIM(v_row->>'item_description'),
          NULL,
          (v_row->>'quantity')::numeric,
          (v_row->>'unit_price')::numeric,
          v_item_position
        );
      END IF;
      v_item_position := v_item_position + 1;
      v_created_items := v_created_items + 1;
    END LOOP;
  END LOOP;

  -- Recompute invoice.amount from persisted line items (outstanding/paid are view-derived)
  FOR v_inv, v_invoice_id IN SELECT key, value FROM jsonb_each_text(v_invoice_ids)
  LOOP
    SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_subtotal
    FROM public.invoice_items
    WHERE invoice_id = (v_invoice_id::uuid);

    UPDATE public.invoices
    SET amount = v_subtotal,
        updated_at = NOW()
    WHERE id = (v_invoice_id::uuid);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
END;
$func$;

COMMENT ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) IS
  'Internal grouped invoice import: explicit UPDATE/INSERT headers, one DELETE per invoice, all items inserted, paid-total guard on re-import, existing-client resolution only (no client auto-create), full-batch rollback on execute errors.';
