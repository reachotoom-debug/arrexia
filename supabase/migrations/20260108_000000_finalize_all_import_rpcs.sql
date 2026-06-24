-- ============================================================================
-- Final Import RPCs: Canonical Unified Functions
-- ============================================================================
-- 
-- This migration defines the FINAL, canonical import functions for:
-- - rpc_import_clients
-- - rpc_import_invoices
-- - rpc_import_payments
-- 
-- STRICT CONTRACT:
-- - Signature: (p_workspace_id UUID, p_rows JSONB)
-- - Returns: JSONB array of { rowId, status: ok|failed, entity_id, action, error }
-- - NEVER raises exceptions for row-level errors
-- - Validates workspace existence ONCE at the top
-- - All financial math computed in SQL
-- - One transaction per function call
-- ============================================================================

-- ============================================================================
-- rpc_import_clients
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_import_clients(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_import_clients(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_exists BOOLEAN;
  v_has_org_id BOOLEAN;
  v_org_id UUID;
  
  v_row JSONB;
  v_row_id TEXT;
  v_client_id UUID;
  
  v_name TEXT;
  v_email TEXT;
  v_company TEXT;
  v_whatsapp TEXT;
  v_is_active BOOLEAN;
  v_archived_at TIMESTAMPTZ;
  
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_msg TEXT;
BEGIN
  -- Validate workspace exists ONCE at the top
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) INTO v_workspace_exists;
  IF NOT v_workspace_exists THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'Workspace not found: ' || p_workspace_id::TEXT
    ));
  END IF;

  -- Validate p_rows is a JSONB array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'p_rows must be a JSON array'
    ));
  END IF;

  -- Check if organization_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id if needed
  IF v_has_org_id THEN
    SELECT c.organization_id INTO v_org_id
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id AND c.organization_id IS NOT NULL
    LIMIT 1;
    
    IF v_org_id IS NULL THEN
      SELECT i.organization_id INTO v_org_id
      FROM public.invoices i
      WHERE i.workspace_id = p_workspace_id AND i.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Process each row
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
    v_client_id := NULL;
    v_error_msg := NULL;

    BEGIN
      -- Extract and validate fields
      v_name := NULLIF(TRIM(v_row->>'name'), '');
      IF v_name IS NULL OR v_name = '' THEN
        v_error_msg := 'Name is required';
      ELSE
        v_email := NULLIF(LOWER(TRIM(v_row->>'email')), '');
        v_company := NULLIF(TRIM(COALESCE(v_row->>'company_name', v_row->>'company')), '');
        v_whatsapp := NULLIF(TRIM(COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')), '');
        
        -- Parse is_active (default true)
        v_is_active := COALESCE(
          CASE WHEN LOWER(COALESCE(v_row->>'is_active', '')) IN ('true', 't', '1', 'yes', 'y') THEN true
               WHEN LOWER(COALESCE(v_row->>'is_active', '')) IN ('false', 'f', '0', 'no', 'n') THEN false
               ELSE NULL END,
          CASE WHEN LOWER(COALESCE(v_row->>'status', '')) = 'active' THEN true
               WHEN LOWER(COALESCE(v_row->>'status', '')) IN ('archived', 'inactive') THEN false
               ELSE true END,
          true
        );

        -- Parse archived_at
        IF v_row->>'archived_at' IS NOT NULL AND TRIM(v_row->>'archived_at') <> '' THEN
          BEGIN
            v_archived_at := (v_row->>'archived_at')::TIMESTAMPTZ;
          EXCEPTION WHEN OTHERS THEN
            v_error_msg := 'Invalid archived_at format: ' || (v_row->>'archived_at');
          END;
        ELSE
          v_archived_at := NULL;
        END IF;

        -- Check organization_id requirement
        IF v_error_msg IS NULL AND v_has_org_id AND v_org_id IS NULL THEN
          v_error_msg := 'organization_id not resolvable for workspace';
        END IF;

        -- Find existing client (by email or whatsapp)
        IF v_error_msg IS NULL THEN
          IF v_email IS NOT NULL THEN
            SELECT id INTO v_client_id
            FROM public.clients
            WHERE workspace_id = p_workspace_id
              AND archived_at IS NULL
              AND email IS NOT NULL
              AND LOWER(email) = v_email
            LIMIT 1;
          END IF;

          IF v_client_id IS NULL AND v_whatsapp IS NOT NULL THEN
            SELECT id INTO v_client_id
            FROM public.clients
            WHERE workspace_id = p_workspace_id
              AND archived_at IS NULL
              AND whatsapp = v_whatsapp
            LIMIT 1;
          END IF;

          -- Insert or update
          IF v_client_id IS NOT NULL THEN
            -- Update existing
            IF v_has_org_id AND v_org_id IS NOT NULL THEN
              UPDATE public.clients
              SET name = v_name,
                  email = COALESCE(v_email, email),
                  company = COALESCE(v_company, company),
                  whatsapp = COALESCE(v_whatsapp, whatsapp),
                  is_active = v_is_active,
                  archived_at = COALESCE(v_archived_at, archived_at),
                  updated_at = NOW()
              WHERE id = v_client_id
              RETURNING id INTO v_client_id;
            ELSE
              UPDATE public.clients
              SET name = v_name,
                  email = COALESCE(v_email, email),
                  company = COALESCE(v_company, company),
                  whatsapp = COALESCE(v_whatsapp, whatsapp),
                  is_active = v_is_active,
                  archived_at = COALESCE(v_archived_at, archived_at),
                  updated_at = NOW()
              WHERE id = v_client_id
              RETURNING id INTO v_client_id;
            END IF;

            v_result := jsonb_build_object(
              'rowId', v_row_id,
              'status', 'ok',
              'entity_id', v_client_id,
              'action', 'update',
              'error', NULL
            );
          ELSE
            -- Insert new
            IF v_has_org_id AND v_org_id IS NOT NULL THEN
              INSERT INTO public.clients (
                workspace_id, organization_id,
                name, email, company, whatsapp,
                is_active, archived_at
              )
              VALUES (
                p_workspace_id, v_org_id,
                v_name, v_email, v_company, v_whatsapp,
                v_is_active, v_archived_at
              )
              RETURNING id INTO v_client_id;
            ELSE
              INSERT INTO public.clients (
                workspace_id,
                name, email, company, whatsapp,
                is_active, archived_at
              )
              VALUES (
                p_workspace_id,
                v_name, v_email, v_company, v_whatsapp,
                v_is_active, v_archived_at
              )
              RETURNING id INTO v_client_id;
            END IF;

            v_result := jsonb_build_object(
              'rowId', v_row_id,
              'status', 'ok',
              'entity_id', v_client_id,
              'action', 'insert',
              'error', NULL
            );
          END IF;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_error_msg := SQLERRM;
    END;

    -- Build result (error or success)
    IF v_error_msg IS NOT NULL OR v_result IS NULL THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'failed',
        'entity_id', NULL,
        'action', 'fail',
        'error', COALESCE(v_error_msg, 'Unknown error')
      );
    END IF;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_import_clients(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.rpc_import_clients(UUID, JSONB) IS
'Imports clients from JSONB array. Signature: (p_workspace_id UUID, p_rows JSONB). Returns JSONB array: [{ rowId, status: ok|failed, entity_id (client_id), action: insert|update|fail, error }]. Validates workspace existence once at top. Never raises exceptions for row-level errors. Matches existing clients by email (case-insensitive) or whatsapp. Computes is_active from status field if provided.';

-- ============================================================================
-- rpc_import_invoices
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_import_invoices(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_import_invoices(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_exists BOOLEAN;
  v_has_org_id BOOLEAN;
  v_org_id UUID;
  
  v_row JSONB;
  v_row_id TEXT;
  v_invoice_id UUID;
  
  v_invoice_number TEXT;
  v_client_email TEXT;
  v_client_name TEXT;
  v_client_id UUID;
  v_issue_date DATE;
  v_due_date DATE;
  v_currency TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_items JSONB;
  v_total NUMERIC;
  
  v_item JSONB;
  v_item_description TEXT;
  v_item_qty NUMERIC;
  v_item_unit_price NUMERIC;
  v_item_position INTEGER;
  
  v_existing_invoice_id UUID;
  v_existing_archived BOOLEAN;
  
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_msg TEXT;
BEGIN
  -- Validate workspace exists ONCE at the top
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) INTO v_workspace_exists;
  IF NOT v_workspace_exists THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'Workspace not found: ' || p_workspace_id::TEXT
    ));
  END IF;

  -- Validate p_rows is a JSONB array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'p_rows must be a JSON array'
    ));
  END IF;

  -- Check if organization_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id if needed
  IF v_has_org_id THEN
    SELECT i.organization_id INTO v_org_id
    FROM public.invoices i
    WHERE i.workspace_id = p_workspace_id AND i.organization_id IS NOT NULL
    LIMIT 1;
    
    IF v_org_id IS NULL THEN
      SELECT c.organization_id INTO v_org_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id AND c.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Process each invoice (each row is one invoice with items array)
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id');
    v_invoice_id := NULL;
    v_error_msg := NULL;

    BEGIN
      -- Extract fields
      v_invoice_number := NULLIF(TRIM(v_row->>'invoice_number'), '');
      v_client_email := NULLIF(TRIM(v_row->>'client_email'), '');
      v_client_name := NULLIF(TRIM(v_row->>'client_name'), '');
      v_currency := COALESCE(NULLIF(TRIM(v_row->>'currency'), ''), 'USD');
      v_status := LOWER(COALESCE(NULLIF(TRIM(v_row->>'status'), ''), 'sent'));
      v_notes := NULLIF(TRIM(v_row->>'notes'), '');
      v_items := v_row->'items';

      -- Validate required fields
      IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
        v_error_msg := 'invoice_number is required';
      ELSIF v_status NOT IN ('draft', 'sent', 'void') THEN
        v_error_msg := 'status must be draft, sent, or void';
      ELSIF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        v_error_msg := 'At least one item is required';
      END IF;

      -- Parse dates
      IF v_error_msg IS NULL THEN
        IF v_row->>'issue_date' IS NOT NULL AND TRIM(v_row->>'issue_date') <> '' THEN
          BEGIN
            v_issue_date := (v_row->>'issue_date')::DATE;
          EXCEPTION WHEN OTHERS THEN
            v_error_msg := 'Invalid issue_date format: ' || (v_row->>'issue_date');
          END;
        ELSE
          v_error_msg := 'issue_date is required';
        END IF;
      END IF;

      IF v_error_msg IS NULL THEN
        IF v_row->>'due_date' IS NOT NULL AND TRIM(v_row->>'due_date') <> '' THEN
          BEGIN
            v_due_date := (v_row->>'due_date')::DATE;
          EXCEPTION WHEN OTHERS THEN
            v_error_msg := 'Invalid due_date format: ' || (v_row->>'due_date');
          END;
        ELSE
          v_error_msg := 'due_date is required';
        END IF;
      END IF;

      -- Resolve client_id
      IF v_error_msg IS NULL THEN
        IF v_client_email IS NOT NULL THEN
          SELECT id INTO v_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND email IS NOT NULL
            AND LOWER(email) = LOWER(v_client_email)
          LIMIT 1;
        END IF;

        IF v_client_id IS NULL AND v_client_name IS NOT NULL THEN
          SELECT id INTO v_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND name = v_client_name
          LIMIT 1;
        END IF;

        IF v_client_id IS NULL THEN
          v_error_msg := 'Client not found (email: ' || COALESCE(v_client_email, 'N/A') || ', name: ' || COALESCE(v_client_name, 'N/A') || ')';
        END IF;
      END IF;

      -- Check existing invoice
      IF v_error_msg IS NULL THEN
        SELECT id, (archived_at IS NOT NULL) INTO v_existing_invoice_id, v_existing_archived
        FROM public.invoices
        WHERE workspace_id = p_workspace_id AND invoice_number = v_invoice_number
        LIMIT 1;

        IF v_existing_invoice_id IS NOT NULL AND v_existing_archived THEN
          v_error_msg := 'Invoice is archived';
        END IF;
      END IF;

      -- Compute total from items (financial math in SQL)
      IF v_error_msg IS NULL THEN
        v_total := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
          v_item_qty := (v_item->>'qty')::NUMERIC;
          v_item_unit_price := (v_item->>'unit_price')::NUMERIC;
          IF v_item_qty IS NOT NULL AND v_item_unit_price IS NOT NULL THEN
            v_total := v_total + (v_item_qty * v_item_unit_price);
          END IF;
        END LOOP;

        IF v_total IS NULL OR v_total <= 0 THEN
          v_error_msg := 'Total amount must be greater than 0 (computed from items)';
        END IF;
      END IF;

      -- Check organization_id requirement
      IF v_error_msg IS NULL AND v_has_org_id AND v_org_id IS NULL THEN
        v_error_msg := 'organization_id not resolvable for workspace';
      END IF;

      -- Insert or update invoice
      IF v_error_msg IS NULL THEN
        IF v_existing_invoice_id IS NOT NULL THEN
          -- Update existing invoice
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            UPDATE public.invoices
            SET client_id = v_client_id,
                issue_date = v_issue_date,
                due_date = v_due_date,
                currency = v_currency,
                status = v_status,
                notes = v_notes,
                amount = v_total,
                updated_at = NOW()
            WHERE id = v_existing_invoice_id
            RETURNING id INTO v_invoice_id;
          ELSE
            UPDATE public.invoices
            SET client_id = v_client_id,
                issue_date = v_issue_date,
                due_date = v_due_date,
                currency = v_currency,
                status = v_status,
                notes = v_notes,
                amount = v_total,
                updated_at = NOW()
            WHERE id = v_existing_invoice_id
            RETURNING id INTO v_invoice_id;
          END IF;

          -- Delete existing items
          DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

          -- Insert new items
          v_item_position := 1;
          FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
          LOOP
            v_item_description := NULLIF(TRIM(v_item->>'description'), '');
            v_item_qty := (v_item->>'qty')::NUMERIC;
            v_item_unit_price := (v_item->>'unit_price')::NUMERIC;

            IF v_item_description IS NOT NULL AND v_item_qty IS NOT NULL AND v_item_unit_price IS NOT NULL THEN
              IF v_has_org_id AND v_org_id IS NOT NULL THEN
                INSERT INTO public.invoice_items (
                  organization_id, invoice_id, name, description, quantity, unit_price, position
                )
                VALUES (v_org_id, v_invoice_id, v_item_description, NULL, v_item_qty, v_item_unit_price, v_item_position);
              ELSE
                INSERT INTO public.invoice_items (
                  invoice_id, name, description, quantity, unit_price, position
                )
                VALUES (v_invoice_id, v_item_description, NULL, v_item_qty, v_item_unit_price, v_item_position);
              END IF;
              v_item_position := v_item_position + 1;
            END IF;
          END LOOP;

          v_result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'entity_id', v_invoice_id,
            'action', 'update',
            'error', NULL
          );
        ELSE
          -- Insert new invoice
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            INSERT INTO public.invoices (
              workspace_id, organization_id, client_id, invoice_number,
              issue_date, due_date, currency, status, notes, amount
            )
            VALUES (
              p_workspace_id, v_org_id, v_client_id, v_invoice_number,
              v_issue_date, v_due_date, v_currency, v_status, v_notes, v_total
            )
            RETURNING id INTO v_invoice_id;
          ELSE
            INSERT INTO public.invoices (
              workspace_id, client_id, invoice_number,
              issue_date, due_date, currency, status, notes, amount
            )
            VALUES (
              p_workspace_id, v_client_id, v_invoice_number,
              v_issue_date, v_due_date, v_currency, v_status, v_notes, v_total
            )
            RETURNING id INTO v_invoice_id;
          END IF;

          -- Insert items
          v_item_position := 1;
          FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
          LOOP
            v_item_description := NULLIF(TRIM(v_item->>'description'), '');
            v_item_qty := (v_item->>'qty')::NUMERIC;
            v_item_unit_price := (v_item->>'unit_price')::NUMERIC;

            IF v_item_description IS NOT NULL AND v_item_qty IS NOT NULL AND v_item_unit_price IS NOT NULL THEN
              IF v_has_org_id AND v_org_id IS NOT NULL THEN
                INSERT INTO public.invoice_items (
                  organization_id, invoice_id, name, description, quantity, unit_price, position
                )
                VALUES (v_org_id, v_invoice_id, v_item_description, NULL, v_item_qty, v_item_unit_price, v_item_position);
              ELSE
                INSERT INTO public.invoice_items (
                  invoice_id, name, description, quantity, unit_price, position
                )
                VALUES (v_invoice_id, v_item_description, NULL, v_item_qty, v_item_unit_price, v_item_position);
              END IF;
              v_item_position := v_item_position + 1;
            END IF;
          END LOOP;

          v_result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'entity_id', v_invoice_id,
            'action', 'insert',
            'error', NULL
          );
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_error_msg := SQLERRM;
    END;

    -- Build result (error or success)
    IF v_error_msg IS NOT NULL OR v_result IS NULL THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'failed',
        'entity_id', NULL,
        'action', 'fail',
        'error', COALESCE(v_error_msg, 'Unknown error')
      );
    END IF;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_import_invoices(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.rpc_import_invoices(UUID, JSONB) IS
'Imports invoices with items from JSONB array. Signature: (p_workspace_id UUID, p_rows JSONB). Returns JSONB array: [{ rowId, status: ok|failed, entity_id (invoice_id), action: insert|update|fail, error }]. Each row represents one invoice with items array. Validates workspace existence once at top. Never raises exceptions for row-level errors. Computes total from items in SQL (qty * unit_price summed). Transaction-safe: invoice + items commit together. Prevents updates to archived invoices.';

-- ============================================================================
-- rpc_import_payments
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_import_payments(uuid, jsonb);
DROP FUNCTION IF EXISTS public.rpc_import_payments(uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.rpc_import_payments(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_exists BOOLEAN;
  v_has_org_id BOOLEAN;
  v_has_transaction_fee BOOLEAN;
  v_org_id UUID;
  
  v_row JSONB;
  v_row_id TEXT;
  v_payment_id UUID;
  v_payment_exists BOOLEAN;
  
  v_invoice_number_raw TEXT;
  v_invoice_number TEXT;
  v_invoice_id UUID;
  v_client_id UUID;
  v_payment_date DATE;
  v_amount NUMERIC;
  v_currency TEXT;
  v_method TEXT;
  v_provider TEXT;
  v_status TEXT;
  v_transaction_id TEXT;
  v_transaction_fee NUMERIC;
  v_notes TEXT;
  v_date_str TEXT;
  
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_msg TEXT;
BEGIN
  -- Validate workspace exists ONCE at the top
  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) INTO v_workspace_exists;
  IF NOT v_workspace_exists THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'Workspace not found: ' || p_workspace_id::TEXT
    ));
  END IF;

  -- Validate p_rows is a JSONB array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'entity_id', NULL,
      'action', 'fail',
      'error', 'p_rows must be a JSON array'
    ));
  END IF;

  -- Check if optional columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'transaction_fee'
  ) INTO v_has_transaction_fee;

  -- Resolve organization_id if needed
  IF v_has_org_id THEN
    SELECT c.organization_id INTO v_org_id
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id AND c.organization_id IS NOT NULL
    LIMIT 1;
    
    IF v_org_id IS NULL THEN
      SELECT i.organization_id INTO v_org_id
      FROM public.invoices i
      WHERE i.workspace_id = p_workspace_id AND i.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Process each row
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id');
    v_payment_id := NULL;
    v_error_msg := NULL;

    BEGIN
      -- Extract and validate required fields
      v_invoice_number_raw := NULLIF(TRIM(COALESCE(v_row->>'invoice_number', '')), '');
      IF v_invoice_number_raw IS NULL OR v_invoice_number_raw = '' THEN
        v_error_msg := 'Missing invoice_number';
      ELSE
        -- Normalize invoice_number (trim, take first token if spaces)
        v_invoice_number := v_invoice_number_raw;
        IF POSITION(' ' IN v_invoice_number) > 0 THEN
          v_invoice_number := SPLIT_PART(v_invoice_number, ' ', 1);
        END IF;

        -- Parse payment_date (accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY)
        v_date_str := NULLIF(TRIM(COALESCE(v_row->>'payment_date', '')), '');
        IF v_date_str IS NULL OR v_date_str = '' THEN
          v_error_msg := 'Missing payment_date';
        ELSE
          BEGIN
            v_payment_date := v_date_str::DATE;
          EXCEPTION WHEN OTHERS THEN
            IF v_date_str LIKE '%/%' THEN
              BEGIN
                v_payment_date := TO_DATE(v_date_str, 'MM/DD/YYYY');
              EXCEPTION WHEN OTHERS THEN
                BEGIN
                  v_payment_date := TO_DATE(v_date_str, 'M/D/YYYY');
                EXCEPTION WHEN OTHERS THEN
                  v_error_msg := format('Invalid date format: %s', v_date_str);
                END;
              END;
            ELSIF v_date_str LIKE '%-%-%' AND POSITION('-' IN v_date_str) < 5 THEN
              BEGIN
                v_payment_date := TO_DATE(v_date_str, 'DD-MM-YYYY');
              EXCEPTION WHEN OTHERS THEN
                v_error_msg := format('Invalid date format: %s', v_date_str);
              END;
            ELSE
              v_error_msg := format('Invalid date format: %s', v_date_str);
            END IF;
          END;
        END IF;

        -- Validate amount
        IF v_error_msg IS NULL THEN
          v_amount := NULLIF(COALESCE(v_row->>'amount', ''), '')::NUMERIC;
          IF v_amount IS NULL THEN
            v_error_msg := 'Missing amount';
          ELSIF v_amount <= 0 THEN
            v_error_msg := format('Amount must be positive, got: %s', v_amount);
          ELSE
            -- Extract optional fields
            v_currency := NULLIF(UPPER(TRIM(COALESCE(v_row->>'currency', ''))), '');
            v_method := NULLIF(TRIM(COALESCE(v_row->>'method', '')), '');
            v_provider := NULLIF(TRIM(COALESCE(v_row->>'payment_provider', '')), '');
            v_status := LOWER(TRIM(COALESCE(v_row->>'status', 'completed')));
            v_transaction_id := NULLIF(TRIM(COALESCE(v_row->>'transaction_id', '')), '');
            v_notes := NULLIF(TRIM(COALESCE(v_row->>'notes', '')), '');
            
            IF v_has_transaction_fee THEN
              v_transaction_fee := COALESCE((NULLIF(v_row->>'transaction_fee', ''))::NUMERIC, 0);
            ELSE
              v_transaction_fee := 0;
            END IF;

            -- Default currency
            IF v_currency IS NULL OR v_currency = '' THEN
              v_currency := 'USD';
            END IF;

            -- Validate currency format (3-letter ISO)
            IF LENGTH(v_currency) <> 3 OR NOT (v_currency ~ '^[A-Z]{3}$') THEN
              v_error_msg := format('Invalid currency: %s (must be 3-letter ISO code)', v_currency);
            ELSIF v_status NOT IN ('completed', 'pending', 'failed') THEN
              v_error_msg := format('Invalid status: %s (must be completed, pending, or failed)', v_status);
            ELSE
              -- Find invoice by workspace_id + invoice_number
              SELECT id, client_id
              INTO v_invoice_id, v_client_id
              FROM public.invoices
              WHERE workspace_id = p_workspace_id
                AND invoice_number = v_invoice_number
                AND archived_at IS NULL
              LIMIT 1;

              IF v_invoice_id IS NULL THEN
                v_error_msg := format('Invoice not found: %s', v_invoice_number);
              ELSE
                -- Use invoice currency if CSV currency is empty
                IF v_currency IS NULL OR v_currency = '' THEN
                  SELECT currency INTO v_currency
                  FROM public.invoices
                  WHERE id = v_invoice_id;
                  v_currency := COALESCE(v_currency, 'USD');
                END IF;

                -- Check if payment exists (for action detection)
                v_payment_exists := false;
                IF v_transaction_id IS NOT NULL AND v_transaction_id != '' THEN
                  SELECT EXISTS (
                    SELECT 1 FROM public.payments
                    WHERE workspace_id = p_workspace_id
                      AND transaction_id = v_transaction_id
                      AND archived_at IS NULL
                  ) INTO v_payment_exists;
                END IF;

                -- Insert payment (use ON CONFLICT for deduplication by transaction_id)
                -- NEVER references net_amount (computed/generated)
                IF v_has_org_id AND v_has_transaction_fee THEN
                  INSERT INTO public.payments (
                    workspace_id, organization_id, invoice_id, client_id,
                    payment_date, amount, currency, method, payment_provider,
                    status, transaction_id, transaction_fee, notes
                  )
                  VALUES (
                    p_workspace_id, v_org_id, v_invoice_id, v_client_id,
                    v_payment_date, v_amount, v_currency, v_method, v_provider,
                    v_status, v_transaction_id, v_transaction_fee, v_notes
                  )
                  ON CONFLICT (workspace_id, transaction_id)
                  WHERE archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != ''
                  DO UPDATE SET
                    invoice_id = EXCLUDED.invoice_id,
                    client_id = EXCLUDED.client_id,
                    amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency,
                    payment_date = EXCLUDED.payment_date,
                    method = EXCLUDED.method,
                    payment_provider = EXCLUDED.payment_provider,
                    status = EXCLUDED.status,
                    transaction_fee = EXCLUDED.transaction_fee,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()
                  RETURNING id INTO v_payment_id;
                ELSIF v_has_org_id THEN
                  INSERT INTO public.payments (
                    workspace_id, organization_id, invoice_id, client_id,
                    payment_date, amount, currency, method, payment_provider,
                    status, transaction_id, notes
                  )
                  VALUES (
                    p_workspace_id, v_org_id, v_invoice_id, v_client_id,
                    v_payment_date, v_amount, v_currency, v_method, v_provider,
                    v_status, v_transaction_id, v_notes
                  )
                  ON CONFLICT (workspace_id, transaction_id)
                  WHERE archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != ''
                  DO UPDATE SET
                    invoice_id = EXCLUDED.invoice_id,
                    client_id = EXCLUDED.client_id,
                    amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency,
                    payment_date = EXCLUDED.payment_date,
                    method = EXCLUDED.method,
                    payment_provider = EXCLUDED.payment_provider,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()
                  RETURNING id INTO v_payment_id;
                ELSIF v_has_transaction_fee THEN
                  INSERT INTO public.payments (
                    workspace_id, invoice_id, client_id,
                    payment_date, amount, currency, method, payment_provider,
                    status, transaction_id, transaction_fee, notes
                  )
                  VALUES (
                    p_workspace_id, v_invoice_id, v_client_id,
                    v_payment_date, v_amount, v_currency, v_method, v_provider,
                    v_status, v_transaction_id, v_transaction_fee, v_notes
                  )
                  ON CONFLICT (workspace_id, transaction_id)
                  WHERE archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != ''
                  DO UPDATE SET
                    invoice_id = EXCLUDED.invoice_id,
                    client_id = EXCLUDED.client_id,
                    amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency,
                    payment_date = EXCLUDED.payment_date,
                    method = EXCLUDED.method,
                    payment_provider = EXCLUDED.payment_provider,
                    status = EXCLUDED.status,
                    transaction_fee = EXCLUDED.transaction_fee,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()
                  RETURNING id INTO v_payment_id;
                ELSE
                  INSERT INTO public.payments (
                    workspace_id, invoice_id, client_id,
                    payment_date, amount, currency, method, payment_provider,
                    status, transaction_id, notes
                  )
                  VALUES (
                    p_workspace_id, v_invoice_id, v_client_id,
                    v_payment_date, v_amount, v_currency, v_method, v_provider,
                    v_status, v_transaction_id, v_notes
                  )
                  ON CONFLICT (workspace_id, transaction_id)
                  WHERE archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != ''
                  DO UPDATE SET
                    invoice_id = EXCLUDED.invoice_id,
                    client_id = EXCLUDED.client_id,
                    amount = EXCLUDED.amount,
                    currency = EXCLUDED.currency,
                    payment_date = EXCLUDED.payment_date,
                    method = EXCLUDED.method,
                    payment_provider = EXCLUDED.payment_provider,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()
                  RETURNING id INTO v_payment_id;
                END IF;

                -- Build success result
                IF v_payment_id IS NOT NULL THEN
                  v_result := jsonb_build_object(
                    'rowId', v_row_id,
                    'status', 'ok',
                    'entity_id', v_payment_id,
                    'action', CASE WHEN v_payment_exists THEN 'update' ELSE 'insert' END,
                    'error', NULL
                  );
                END IF;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_error_msg := SQLERRM;
    END;

    -- Build result (error or success)
    IF v_error_msg IS NOT NULL OR v_result IS NULL THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'failed',
        'entity_id', NULL,
        'action', 'fail',
        'error', COALESCE(v_error_msg, 'Unknown error')
      );
    END IF;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_import_payments(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.rpc_import_payments(UUID, JSONB) IS
'Imports payments from JSONB array. Signature: (p_workspace_id UUID, p_rows JSONB). Returns JSONB array: [{ rowId, status: ok|failed, entity_id (payment_id), action: insert|update|fail, error }]. Validates workspace existence once at top. Never raises exceptions for row-level errors. NEVER references net_amount (computed/generated). Resolves invoice by invoice_number and client_id from invoice. Uses transaction_id deduplication. Supports date formats: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY.';

-- Force PostgREST schema reload
SELECT pg_notify('pgrst', 'reload schema');

