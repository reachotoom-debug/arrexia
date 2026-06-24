-- ============================================================================
-- Add duplicate invoice_number detection to import_invoices_grouped RPC
-- ============================================================================
-- 
-- This migration adds validation to detect duplicate invoice_number values
-- in rows where row_type='invoice' during dry_run validation.
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
  
  -- Duplicate detection: track invoice_numbers seen in invoice rows
  v_invoice_numbers_seen jsonb := '{}'::jsonb; -- invoice_number -> count
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

  -- Validate (first pass: detect duplicates and validate fields)
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
      -- Detect duplicate invoice_number in invoice rows
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
  -- Process invoice rows first (build v_invoice_ids map), then items
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'invoice' THEN
      -- Resolve client
      v_client_id := NULL;
      
      -- 1) Try client_email first (case-insensitive, non-archived)
      IF COALESCE(v_row->>'client_email','') <> '' THEN
        SELECT id INTO v_client_id
        FROM clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(email)) = LOWER(TRIM(v_row->>'client_email'))
        LIMIT 1;
      END IF;
      
      -- 2) If not found AND client_name provided: try lookup by workspace_id + normalized lower(name)
      IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
        DECLARE
          v_client_count int;
        BEGIN
          SELECT COUNT(*) INTO v_client_count
          FROM clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'));
          
          IF v_client_count = 0 THEN
            -- Auto-create client if not found
            INSERT INTO clients (workspace_id, organization_id, name, email, is_active, archived_at)
            VALUES (
              p_workspace_id,
              CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
              TRIM(v_row->>'client_name'),
              NULLIF(TRIM(v_row->>'client_email'), ''),
              true,
              NULL
            )
            RETURNING id INTO v_client_id;
            v_created_clients := v_created_clients + 1;
          ELSIF v_client_count = 1 THEN
            SELECT id INTO v_client_id
            FROM clients
            WHERE workspace_id = p_workspace_id
              AND archived_at IS NULL
              AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'))
            LIMIT 1;
          ELSE
            -- Multiple clients match name - error
            v_errors := v_errors || jsonb_build_array(format('Multiple clients match name "%s" for %s. Use client_email or unique identifier.', v_row->>'client_name', v_inv));
            CONTINUE;
          END IF;
        END;
      END IF;
      
      IF v_client_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Client not found for %s', v_inv));
        CONTINUE;
      END IF;

      -- Upsert invoice (ON CONFLICT on unique index)
      INSERT INTO invoices (
        workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount, total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, 
        CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
        v_client_id, 
        v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
        LOWER(TRIM(v_row->>'status')), -- Store as lowercase: draft/sent/void
        NULLIF(v_row->>'po_number',''),
        NULLIF(v_row->>'notes',''),
        0, 0, 0, 'unpaid' -- Will be computed from items after insert
      )
      ON CONFLICT (workspace_id, invoice_number) WHERE archived_at IS NULL
      DO UPDATE SET
        client_id = EXCLUDED.client_id,
        issue_date = EXCLUDED.issue_date, -- Preserve exactly as provided
        due_date = EXCLUDED.due_date, -- Preserve exactly as provided
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        po_number = EXCLUDED.po_number,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id INTO v_invoice_id;
      
      IF v_invoice_id IS NULL THEN
        SELECT id INTO v_invoice_id
        FROM invoices
        WHERE workspace_id = p_workspace_id
          AND invoice_number = v_inv
          AND archived_at IS NULL
        LIMIT 1;
      END IF;
      
      -- Store invoice_id in map (only if not already present to prevent overwrites)
      IF NOT (v_invoice_ids ? v_inv) THEN
        v_invoice_ids := v_invoice_ids || jsonb_build_object(v_inv, v_invoice_id::text);
        v_created_invoices := v_created_invoices + 1;
      ELSE
        -- Invoice already processed - this should not happen if validation worked correctly
        -- But if it does, use the existing invoice_id (don't overwrite)
        v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      END IF;
    END IF;
  END LOOP;

  -- Process item rows (bind to nearest preceding invoice header)
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'item' THEN
      IF NOT (v_invoice_ids ? v_inv) THEN
        v_errors := v_errors || jsonb_build_array(format('Item row references invoice_number "%s" which does not exist in this file', v_inv));
        CONTINUE;
      END IF;
      
      v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      
      -- Delete existing items for this invoice (replace strategy)
      DELETE FROM invoice_items WHERE invoice_id = v_invoice_id;
      
      -- Insert new item
      INSERT INTO invoice_items (
        workspace_id, organization_id, invoice_id, description, quantity, unit_price, amount
      )
      VALUES (
        p_workspace_id,
        CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
        v_invoice_id,
        TRIM(v_row->>'item_description'),
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        ((v_row->>'quantity')::numeric * (v_row->>'unit_price')::numeric)
      );
      v_created_items := v_created_items + 1;
    END IF;
  END LOOP;

  -- Compute totals for all invoices
  FOR v_inv, v_invoice_id IN SELECT * FROM jsonb_each_text(v_invoice_ids)
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = (v_invoice_id::uuid);
    
    UPDATE invoices
    SET amount = v_subtotal,
        outstanding_amount = v_subtotal - COALESCE(total_paid, 0),
        updated_at = NOW()
    WHERE id = (v_invoice_id::uuid);
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
END;
$func$;

COMMENT ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) IS
'Imports invoices + items per invoice. Workspace scoped. Per-invoice atomic. Returns JSONB results. Validates duplicate invoice_number in file during dry_run. Preserves issue_date and due_date exactly as provided.';

