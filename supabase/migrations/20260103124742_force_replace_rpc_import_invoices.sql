-- ============================================================================
-- Force Replace RPC Import Invoices: Drop all overloads and create canonical function
-- ============================================================================
-- 
-- This migration:
-- 1) Drops ALL existing overloads of rpc_import_invoices
-- 2) Ensures unique index exists
-- 3) Creates canonical function for grouped CSV invoice import
-- 
-- Rules:
-- - Workspace scoped only
-- - All-or-nothing: if ANY invoice group fails, rollback everything
-- - Resolve client by email first, then name
-- - Upsert invoices, replace items
-- 
-- ============================================================================

-- Drop all existing overloads of rpc_import_invoices
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_function_identity_arguments(oid) as args
    FROM pg_proc
    WHERE proname = 'rpc_import_invoices'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.rpc_import_invoices(' || r.args || ') CASCADE';
  END LOOP;
END $$;

-- Ensure unique index exists
CREATE UNIQUE INDEX IF NOT EXISTS invoices_workspace_invoice_number_unique
ON public.invoices (workspace_id, invoice_number)
WHERE archived_at IS NULL;

-- Create canonical function
CREATE OR REPLACE FUNCTION public.rpc_import_invoices(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r JSONB;
  results JSONB := '[]'::JSONB;
  result JSONB;

  v_row_id TEXT;
  v_invoice_number TEXT;
  v_client_email TEXT;
  v_client_name TEXT;
  v_issue_date DATE;
  v_due_date DATE;
  v_currency TEXT;
  v_base_status TEXT;
  v_notes TEXT;
  v_po_number TEXT;

  v_client_id UUID;
  v_invoice_id UUID;

  v_items JSONB;
  v_item JSONB;

  v_desc TEXT;
  v_qty NUMERIC;
  v_unit NUMERIC;
  v_amount NUMERIC;

  v_total NUMERIC := 0;
  v_existing_id UUID;
  v_existing_archived_at TIMESTAMPTZ;

  v_org_id UUID;
  v_has_org_id BOOLEAN;
  v_item_position INTEGER;

  v_match_count INTEGER;
  v_email_part TEXT;
  v_name_part TEXT;

  err TEXT;
  has_errors BOOLEAN := false;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  -- Check if organization_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id from existing workspace data (NOT from workspaces table)
  IF v_has_org_id THEN
    SELECT i.organization_id INTO v_org_id
    FROM public.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.organization_id IS NOT NULL
    LIMIT 1;
    
    IF v_org_id IS NULL THEN
      SELECT c.organization_id INTO v_org_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id
        AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- First pass: validate every invoice group and resolve client_id
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    err := NULL;
    v_invoice_id := NULL;
    v_total := 0;

    v_row_id := COALESCE(r->>'rowId', r->>'row_id', r->>'id');
    v_invoice_number := NULLIF(TRIM(r->>'invoice_number'), '');
    v_client_email := NULLIF(TRIM(r->>'client_email'), '');
    v_client_name := NULLIF(TRIM(r->>'client_name'), '');
    v_currency := NULLIF(TRIM(r->>'currency'), '');
    v_base_status := LOWER(COALESCE(NULLIF(TRIM(r->>'status'), ''), NULLIF(TRIM(r->>'base_status'), ''), 'sent'));
    v_notes := NULLIF(TRIM(r->>'notes'), '');
    v_po_number := NULLIF(TRIM(r->>'po_number'), '');

    BEGIN
      -- Validate invoice_number
      IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
        err := 'invoice_number is required';
      END IF;

      -- Validate status (base status only)
      IF err IS NULL AND v_base_status NOT IN ('draft','sent','void') THEN
        err := 'Invalid status (allowed: draft,sent,void)';
      END IF;

      -- Dates
      IF err IS NULL THEN
        BEGIN
          v_issue_date := (r->>'issue_date')::DATE;
        EXCEPTION WHEN OTHERS THEN
          err := 'Invalid issue_date';
        END;
      END IF;

      IF err IS NULL AND r ? 'due_date' AND NULLIF(TRIM(r->>'due_date'), '') IS NOT NULL THEN
        BEGIN
          v_due_date := (r->>'due_date')::DATE;
        EXCEPTION WHEN OTHERS THEN
          err := 'Invalid due_date';
        END;
      ELSE
        v_due_date := NULL;
      END IF;

      -- Resolve client_id:
      -- 1) Prefer match by email (case-insensitive) if provided AND non-empty
      -- 2) Else match by exact client_name within workspace where archived_at is null
      -- 3) If not found -> error
      IF err IS NULL THEN
        -- 1) Try client_email first
        IF v_client_email IS NOT NULL AND v_client_email != '' THEN
          SELECT c.id INTO v_client_id
          FROM public.clients c
          WHERE c.workspace_id = p_workspace_id
            AND c.archived_at IS NULL
            AND c.email IS NOT NULL
            AND LOWER(c.email) = LOWER(v_client_email)
          LIMIT 1;
        END IF;

        -- 2) If not found AND client_name provided: try lookup by workspace_id + lower(name)
        IF v_client_id IS NULL AND v_client_name IS NOT NULL AND v_client_name != '' THEN
          -- Check for multiple matches first
          SELECT COUNT(*) INTO v_match_count
          FROM public.clients c
          WHERE c.workspace_id = p_workspace_id
            AND c.archived_at IS NULL
            AND LOWER(c.name) = LOWER(v_client_name);

          -- If name lookup returns >1 rows: fail with specific message
          IF v_match_count > 1 THEN
            err := 'Multiple clients match name. Use client_email or unique identifier.';
          ELSIF v_match_count = 1 THEN
            -- Single match: get the client_id
            SELECT c.id INTO v_client_id
            FROM public.clients c
            WHERE c.workspace_id = p_workspace_id
              AND c.archived_at IS NULL
              AND LOWER(c.name) = LOWER(v_client_name)
            LIMIT 1;
          END IF;
        END IF;

        -- 3) If still not found: fail with message including both email + name
        IF v_client_id IS NULL AND err IS NULL THEN
          v_email_part := COALESCE(v_client_email, '(not provided)');
          v_name_part := COALESCE(v_client_name, '(not provided)');
          err := 'Client not found in this workspace (email: ' || v_email_part || ', name: ' || v_name_part || '). Import client first (Clients tab) or fix client_email/client_name.';
        END IF;
      END IF;

      -- Items required
      v_items := r->'items';
      IF err IS NULL THEN
        IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
          err := 'items required (at least 1 line item)';
        END IF;
      END IF;

      -- Compute total and validate items
      IF err IS NULL THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
          v_desc := NULLIF(TRIM(v_item->>'description'), '');
          IF v_desc IS NULL THEN
            err := 'Item description required';
            EXIT;
          END IF;

          BEGIN
            v_qty := (v_item->>'quantity')::NUMERIC;
          EXCEPTION WHEN OTHERS THEN
            err := 'Invalid item quantity';
            EXIT;
          END;

          BEGIN
            v_unit := (v_item->>'unit_price')::NUMERIC;
          EXCEPTION WHEN OTHERS THEN
            err := 'Invalid item unit_price';
            EXIT;
          END;

          -- Use amount if provided, else compute from quantity * unit_price
          IF v_item ? 'amount' AND v_item->>'amount' IS NOT NULL THEN
            BEGIN
              v_amount := (v_item->>'amount')::NUMERIC;
            EXCEPTION WHEN OTHERS THEN
              v_amount := v_qty * v_unit;
            END;
          ELSE
            v_amount := v_qty * v_unit;
          END IF;

          IF v_qty < 0 THEN
            err := 'Item quantity must be >= 0';
            EXIT;
          END IF;

          IF v_unit < 0 THEN
            err := 'Item unit_price must be >= 0';
            EXIT;
          END IF;

          v_total := v_total + v_amount;
        END LOOP;
      END IF;

      -- Validate total
      IF err IS NULL AND (v_total IS NULL OR v_total <= 0) THEN
        err := 'Total amount must be greater than 0 (computed from items)';
      END IF;

      -- Check for existing invoice (for duplicate detection)
      IF err IS NULL THEN
        SELECT i.id, i.archived_at
        INTO v_existing_id, v_existing_archived_at
        FROM public.invoices i
        WHERE i.workspace_id = p_workspace_id
          AND i.invoice_number = v_invoice_number
        LIMIT 1;

        -- Block updates to archived invoices
        IF v_existing_id IS NOT NULL AND v_existing_archived_at IS NOT NULL THEN
          err := 'Invoice is archived; cannot import/update';
        END IF;
      END IF;

      -- Build result (validation only, no writes yet)
      IF err IS NOT NULL THEN
        has_errors := true;
        result := jsonb_build_object(
          'rowId', v_row_id,
          'invoice_number', COALESCE(v_invoice_number, ''),
          'status', 'failed',
          'action', 'fail',
          'invoice_id', NULL,
          'error', err
        );
      ELSE
        result := jsonb_build_object(
          'rowId', v_row_id,
          'invoice_number', v_invoice_number,
          'status', 'ok',
          'action', CASE WHEN v_existing_id IS NULL THEN 'insert' ELSE 'update' END,
          'invoice_id', NULL, -- Will be set after insert
          'error', NULL
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      has_errors := true;
      result := jsonb_build_object(
        'rowId', v_row_id,
        'invoice_number', COALESCE(v_invoice_number, ''),
        'status', 'failed',
        'action', 'fail',
        'invoice_id', NULL,
        'error', SQLERRM
      );
    END;

    results := results || jsonb_build_array(result);
  END LOOP;

  -- If any errors, return results without writing anything (all-or-nothing)
  IF has_errors THEN
    RETURN results;
  END IF;

  -- Second pass: all valid, now write to database
  -- Rebuild results array with invoice_ids
  results := '[]'::JSONB;
  
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := COALESCE(r->>'rowId', r->>'row_id', r->>'id');
    v_invoice_number := NULLIF(TRIM(r->>'invoice_number'), '');
    v_client_email := NULLIF(TRIM(r->>'client_email'), '');
    v_client_name := NULLIF(TRIM(r->>'client_name'), '');
    v_currency := NULLIF(TRIM(r->>'currency'), '');
    v_base_status := LOWER(COALESCE(NULLIF(TRIM(r->>'status'), ''), NULLIF(TRIM(r->>'base_status'), ''), 'sent'));
    v_notes := NULLIF(TRIM(r->>'notes'), '');
    v_po_number := NULLIF(TRIM(r->>'po_number'), '');
    v_items := r->'items';
    v_total := 0;

    -- Recompute total
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_unit := (v_item->>'unit_price')::NUMERIC;
      IF v_item ? 'amount' AND v_item->>'amount' IS NOT NULL THEN
        BEGIN
          v_amount := (v_item->>'amount')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
          v_amount := v_qty * v_unit;
        END;
      ELSE
        v_amount := v_qty * v_unit;
      END IF;
      v_total := v_total + v_amount;
    END LOOP;

    -- Resolve client_id (already validated in first pass)
    v_client_id := NULL;
    IF v_client_email IS NOT NULL AND v_client_email != '' THEN
      SELECT c.id INTO v_client_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND c.email IS NOT NULL
        AND LOWER(c.email) = LOWER(v_client_email)
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND v_client_name IS NOT NULL AND v_client_name != '' THEN
      SELECT c.id INTO v_client_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND LOWER(c.name) = LOWER(v_client_name)
      LIMIT 1;
    END IF;

    -- Parse dates
    v_issue_date := (r->>'issue_date')::DATE;
    IF r ? 'due_date' AND NULLIF(TRIM(r->>'due_date'), '') IS NOT NULL THEN
      v_due_date := (r->>'due_date')::DATE;
    ELSE
      v_due_date := NULL;
    END IF;

    -- Check existing (for action determination)
    v_existing_id := NULL;
    SELECT i.id INTO v_existing_id
    FROM public.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.invoice_number = v_invoice_number
    LIMIT 1;

    -- Upsert invoice
    IF v_has_org_id AND v_org_id IS NOT NULL THEN
      INSERT INTO public.invoices (
        workspace_id, organization_id, client_id, invoice_number,
        issue_date, due_date, status,
        amount, currency, notes, po_number, archived_at,
        total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, v_org_id, v_client_id, v_invoice_number,
        v_issue_date, v_due_date, v_base_status,
        v_total, COALESCE(v_currency,'USD'), v_notes, v_po_number, NULL,
        0, v_total, 'unpaid'
      )
      ON CONFLICT (workspace_id, invoice_number)
      WHERE archived_at IS NULL
      DO UPDATE SET
        client_id = EXCLUDED.client_id,
        issue_date = EXCLUDED.issue_date,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        notes = EXCLUDED.notes,
        po_number = EXCLUDED.po_number,
        updated_at = NOW()
      RETURNING id INTO v_invoice_id;
    ELSE
      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number,
        issue_date, due_date, status,
        amount, currency, notes, po_number, archived_at,
        total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, v_client_id, v_invoice_number,
        v_issue_date, v_due_date, v_base_status,
        v_total, COALESCE(v_currency,'USD'), v_notes, v_po_number, NULL,
        0, v_total, 'unpaid'
      )
      ON CONFLICT (workspace_id, invoice_number)
      WHERE archived_at IS NULL
      DO UPDATE SET
        client_id = EXCLUDED.client_id,
        issue_date = EXCLUDED.issue_date,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        notes = EXCLUDED.notes,
        po_number = EXCLUDED.po_number,
        updated_at = NOW()
      RETURNING id INTO v_invoice_id;
    END IF;

    -- Replace items (delete existing, insert new)
    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

    v_item_position := 1;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_desc := TRIM(v_item->>'description');
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_unit := (v_item->>'unit_price')::NUMERIC;
      IF v_item ? 'amount' AND v_item->>'amount' IS NOT NULL THEN
        BEGIN
          v_amount := (v_item->>'amount')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
          v_amount := v_qty * v_unit;
        END;
      ELSE
        v_amount := v_qty * v_unit;
      END IF;

      -- Map "description" from JSON to "name" in invoice_items table
      IF v_has_org_id AND v_org_id IS NOT NULL THEN
        INSERT INTO public.invoice_items (
          organization_id, invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          v_org_id, v_invoice_id, v_desc, NULL, v_qty, v_unit, v_item_position
        );
      ELSE
        INSERT INTO public.invoice_items (
          invoice_id, name, description, quantity, unit_price, position
        )
        VALUES (
          v_invoice_id, v_desc, NULL, v_qty, v_unit, v_item_position
        );
      END IF;

      v_item_position := v_item_position + 1;
    END LOOP;

    -- Build result with invoice_id
    result := jsonb_build_object(
      'rowId', v_row_id,
      'invoice_number', v_invoice_number,
      'status', 'ok',
      'action', CASE WHEN v_existing_id IS NULL THEN 'insert' ELSE 'update' END,
      'invoice_id', v_invoice_id,
      'error', NULL
    );
    
    results := results || jsonb_build_array(result);
  END LOOP;

  RETURN results;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_import_invoices TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_invoices(UUID, JSONB) IS
  'Imports invoices + items per invoice group. Workspace scoped. All-or-nothing: if ANY invoice group fails validation, nothing is written. Returns JSONB results per invoice group.';
