-- ============================================================================
-- Fix import_invoices_grouped RPC: Remove workspaces.currency reference
-- ============================================================================
-- 
-- This migration fixes the import_invoices_grouped function to:
-- - Remove any reference to workspaces.currency (workspaces has no currency column)
-- - Use v_default_currency = 'USD' constant inside the function
-- - Insert invoices.currency using proper 3-character ISO code handling
-- - Keep organization_id loading from workspaces.organization_id
-- - Keep status validation Draft/Sent/Void only
-- - Keep totals computed from invoice_items
-- 
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_invoice_id uuid;

  v_invoice_ids jsonb := '{}'::jsonb; -- invoice_number -> invoice_id
  v_subtotal numeric;
  
  -- Multi-tenant: organization_id from workspace
  v_org_id uuid;
  v_has_org_id boolean;
  
  -- Currency default (DO NOT reference workspaces.currency)
  v_default_currency char(3) := 'USD';
BEGIN
  -- Fetch organization_id from workspace (DO NOT reference workspaces.currency)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'organization_id'
  ) INTO v_has_org_id;
  
  -- Fetch workspace organization_id
  SELECT organization_id INTO v_org_id
  FROM workspaces
  WHERE id = p_workspace_id
  LIMIT 1;
  
  -- Guard: if organization_id column exists, workspace must have organization_id
  IF v_has_org_id AND v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace is missing organization_id. Please contact support to configure your workspace.')
    );
  END IF;
  
  -- Shape check
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('p_rows must be a JSON array'));
  END IF;

  -- Validate
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
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
      IF COALESCE(v_row->>'issue_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing issue_date for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'due_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing due_date for %s', v_inv));
      END IF;
      
      -- Currency validation: must be 3-letter ISO code (A-Z only) if provided
      IF COALESCE(v_row->>'currency','') <> '' THEN
        DECLARE
          v_currency text := UPPER(TRIM(COALESCE(v_row->>'currency','')));
        BEGIN
          IF LENGTH(v_currency) <> 3 OR v_currency !~ '^[A-Z]{3}$' THEN
            v_errors := v_errors || jsonb_build_array(format('Invalid currency "%s" for %s (must be a 3-letter ISO code like USD, EUR, etc.)', v_row->>'currency', v_inv));
          END IF;
        END;
      END IF;

      -- Status validation: only Draft/Sent/Void allowed
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

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'errors', '[]'::jsonb,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  -- Execute: invoices + clients
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF LOWER(COALESCE(v_row->>'row_type','')) <> 'invoice' THEN
      CONTINUE;
    END IF;

    v_inv := COALESCE(v_row->>'invoice_number','');
    v_client_id := NULL;

    -- Match client by email then name
    IF COALESCE(v_row->>'client_email','') <> '' THEN
      SELECT id INTO v_client_id
      FROM clients
      WHERE workspace_id = p_workspace_id
        AND LOWER(email) = LOWER(v_row->>'client_email')
        AND archived_at IS NULL
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
      SELECT id INTO v_client_id
      FROM clients
      WHERE workspace_id = p_workspace_id
        AND LOWER(name) = LOWER(v_row->>'client_name')
        AND archived_at IS NULL
      LIMIT 1;
    END IF;

    -- Create client if missing
    IF v_client_id IS NULL THEN
      IF v_has_org_id THEN
        INSERT INTO clients (workspace_id, organization_id, name, email, is_active, archived_at)
        VALUES (p_workspace_id, v_org_id, NULLIF(v_row->>'client_name',''), NULLIF(v_row->>'client_email',''), true, NULL)
        RETURNING id INTO v_client_id;
      ELSE
        INSERT INTO clients (workspace_id, name, email, is_active, archived_at)
        VALUES (p_workspace_id, NULLIF(v_row->>'client_name',''), NULLIF(v_row->>'client_email',''), true, NULL)
        RETURNING id INTO v_client_id;
      END IF;
      v_created_clients := v_created_clients + 1;
    END IF;

    -- Insert invoice with organization_id if column exists
    -- Currency: coalesce(nullif(upper(left(trim(v_row->>'currency'),3)),'')::char(3), 'USD'::char(3))
    IF v_has_org_id THEN
      INSERT INTO invoices (
        workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount, total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, v_org_id, v_client_id, v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), 'USD'::char(3)),
        LOWER(TRIM(v_row->>'status')), -- Store as lowercase: draft/sent/void
        NULLIF(v_row->>'po_number',''),
        NULLIF(v_row->>'notes',''),
        0, 0, 0, 'unpaid' -- Will be computed from items after insert
      )
      RETURNING id INTO v_invoice_id;
    ELSE
      INSERT INTO invoices (
        workspace_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount, total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, v_client_id, v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), 'USD'::char(3)),
        LOWER(TRIM(v_row->>'status')), -- Store as lowercase: draft/sent/void
        NULLIF(v_row->>'po_number',''),
        NULLIF(v_row->>'notes',''),
        0, 0, 0, 'unpaid' -- Will be computed from items after insert
      )
      RETURNING id INTO v_invoice_id;
    END IF;

    v_invoice_ids := jsonb_set(v_invoice_ids, ARRAY[v_inv], to_jsonb(v_invoice_id), true);
    v_created_invoices := v_created_invoices + 1;
  END LOOP;

  -- Insert items
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF LOWER(COALESCE(v_row->>'row_type','')) <> 'item' THEN
      CONTINUE;
    END IF;

    v_inv := COALESCE(v_row->>'invoice_number','');
    v_invoice_id := (v_invoice_ids ->> v_inv)::uuid;

    -- Insert invoice_item with organization_id if column exists
    IF v_has_org_id THEN
      INSERT INTO invoice_items (organization_id, invoice_id, name, description, quantity, unit_price, position)
      VALUES (
        v_org_id,
        v_invoice_id,
        v_row->>'item_description',
        NULL,
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        1
      );
    ELSE
      INSERT INTO invoice_items (invoice_id, name, description, quantity, unit_price, position)
      VALUES (
        v_invoice_id,
        v_row->>'item_description',
        NULL,
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        1
      );
    END IF;

    v_created_items := v_created_items + 1;
  END LOOP;

  -- Compute totals from items (quantity * unit_price)
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF LOWER(COALESCE(v_row->>'row_type','')) <> 'invoice' THEN
      CONTINUE;
    END IF;

    v_inv := COALESCE(v_row->>'invoice_number','');
    v_invoice_id := (v_invoice_ids ->> v_inv)::uuid;

    -- Compute total from items
    SELECT COALESCE(SUM(quantity * unit_price), 0)
      INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = v_invoice_id;

    -- Update invoice with computed totals (amount = sum of items)
    UPDATE invoices
    SET amount = v_subtotal,
        outstanding_amount = v_subtotal,
        total_paid = 0,
        payment_state = 'unpaid'
    WHERE id = v_invoice_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) IS
  'Imports invoices from grouped CSV/TSV format (row_type invoice|item). Supports dry_run mode. Auto-creates clients if missing. Workspace scoped. Single transaction. Currency defaults to USD if blank.';

