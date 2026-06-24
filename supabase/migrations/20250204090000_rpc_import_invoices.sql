-- ============================================================================
-- RPC Import Invoices: Create unique index and RPC function
-- ============================================================================
-- 
-- This migration creates:
-- 1) Unique partial index on (workspace_id, invoice_number) where archived_at IS NULL
-- 2) RPC function rpc_import_invoices for transaction-safe invoice + items import
-- 
-- Rules:
-- - Each element in p_rows represents ONE invoice group with items array
-- - Invoice + items must commit together (transaction-safe per invoice)
-- - On update: delete existing items, insert new items
-- - Never reference workspaces.organization_id (workspaces table doesn't have it)
-- - Return per-invoice results: { rowId, invoice_number, status: 'ok'|'failed', action: 'insert'|'update'|'fail', invoice_id, error }
-- 
-- ============================================================================

-- Create unique partial index for invoice_number (workspace scoped, non-archived only)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_workspace_invoice_number_unique
ON public.invoices (workspace_id, invoice_number)
WHERE archived_at IS NULL;

-- Create or replace RPC function
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
  v_org_id UUID;
  v_has_org_id BOOLEAN;
  
  v_row_id TEXT;
  v_invoice_number TEXT;
  v_client_email TEXT;
  v_client_name TEXT;
  v_issue_date DATE;
  v_due_date DATE;
  v_currency TEXT;
  v_status TEXT;
  v_notes TEXT;
  v_items JSONB;
  
  v_client_id UUID;
  v_invoice_id UUID;
  v_existing_invoice_id UUID;
  v_existing_archived BOOLEAN;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_err TEXT;
  
  v_item JSONB;
  v_item_description TEXT;
  v_item_qty NUMERIC;
  v_item_unit_price NUMERIC;
  v_item_position INTEGER;
  v_total NUMERIC;
BEGIN
  -- Guard: workspace_id must be present
  IF p_workspace_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('workspace_id is required')
    );
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

  -- Process each invoice group (each element in p_rows is one invoice with items array)
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_err := NULL;
    v_invoice_id := NULL;
    v_existing_invoice_id := NULL;
    v_result := NULL;

    -- Extract rowId
    v_row_id := COALESCE(r->>'rowId', r->>'row_id');

    BEGIN
      -- Extract invoice fields
      v_invoice_number := NULLIF(TRIM(r->>'invoice_number'), '');
      v_client_email := NULLIF(TRIM(r->>'client_email'), '');
      v_client_name := NULLIF(TRIM(r->>'client_name'), '');
      v_currency := COALESCE(NULLIF(TRIM(r->>'currency'), ''), 'USD');
      v_status := lower(COALESCE(NULLIF(TRIM(r->>'status'), ''), 'sent')); -- Ensure lowercase
      v_notes := NULLIF(TRIM(r->>'notes'), '');
      v_items := r->'items';

      -- Parse dates
      IF r->>'issue_date' IS NOT NULL AND TRIM(r->>'issue_date') != '' THEN
        BEGIN
          v_issue_date := (r->>'issue_date')::DATE;
        EXCEPTION
          WHEN OTHERS THEN
            v_err := 'Invalid issue_date format: ' || (r->>'issue_date');
        END;
      ELSE
        v_err := 'issue_date is required';
      END IF;

      IF r->>'due_date' IS NOT NULL AND TRIM(r->>'due_date') != '' THEN
        BEGIN
          v_due_date := (r->>'due_date')::DATE;
        EXCEPTION
          WHEN OTHERS THEN
            v_err := 'Invalid due_date format: ' || (r->>'due_date');
        END;
      ELSE
        v_err := 'due_date is required';
      END IF;

      -- Validate required fields
      IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
        v_err := 'invoice_number is required';
      END IF;

      -- Validate status (only draft/sent/void allowed, already lowercase)
      IF v_status NOT IN ('draft', 'sent', 'void') THEN
        v_err := 'status must be draft, sent, or void';
      END IF;

      -- Validate items
      IF v_err IS NULL AND (v_items IS NULL OR jsonb_array_length(v_items) = 0) THEN
        v_err := 'At least one item is required';
      END IF;

      -- Resolve client_id
      IF v_err IS NULL THEN
        -- Try by email first (case-insensitive)
        IF v_client_email IS NOT NULL THEN
          SELECT id INTO v_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND email IS NOT NULL
            AND LOWER(email) = LOWER(v_client_email)
          LIMIT 1;
        END IF;

        -- If no match by email, try by name (exact match)
        IF v_client_id IS NULL AND v_client_name IS NOT NULL THEN
          SELECT id INTO v_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND name = v_client_name
          LIMIT 1;
        END IF;

        IF v_client_id IS NULL THEN
          v_err := 'Client not found (email: ' || COALESCE(v_client_email, 'N/A') || ', name: ' || COALESCE(v_client_name, 'N/A') || ')';
        END IF;
      END IF;

      -- Check for existing invoice (for update detection and archived check)
      IF v_err IS NULL AND v_invoice_number IS NOT NULL THEN
        SELECT id, (archived_at IS NOT NULL) INTO v_existing_invoice_id, v_existing_archived
        FROM public.invoices
        WHERE workspace_id = p_workspace_id
          AND invoice_number = v_invoice_number
        LIMIT 1;

        -- Prevent update if archived
        IF v_existing_invoice_id IS NOT NULL AND v_existing_archived THEN
          v_err := 'Invoice is archived';
        END IF;
      END IF;

      -- Calculate total from items
      IF v_err IS NULL AND v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        v_total := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
          v_item_qty := (v_item->>'qty')::NUMERIC;
          v_item_unit_price := (v_item->>'unit_price')::NUMERIC;
          IF v_item_qty IS NOT NULL AND v_item_unit_price IS NOT NULL THEN
            v_total := v_total + (v_item_qty * v_item_unit_price);
          END IF;
        END LOOP;
      END IF;

      -- Validate total
      IF v_err IS NULL AND (v_total IS NULL OR v_total <= 0) THEN
        v_err := 'Total amount must be greater than 0 (computed from items)';
      END IF;

      -- Check organization_id requirement
      IF v_has_org_id AND v_org_id IS NULL THEN
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'invoice_number', v_invoice_number,
          'status', 'failed',
          'action', 'fail',
          'invoice_id', NULL,
          'error', 'organization_id not resolvable for workspace'
        );
        v_results := v_results || jsonb_build_array(v_result);
        CONTINUE;
      END IF;

      -- Insert or update invoice
      IF v_err IS NULL THEN
        IF v_existing_invoice_id IS NOT NULL THEN
          -- Update existing invoice
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            UPDATE public.invoices
            SET
              client_id = v_client_id,
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
            SET
              client_id = v_client_id,
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
                  organization_id,
                  invoice_id,
                  name,
                  description,
                  quantity,
                  unit_price,
                  position
                )
                VALUES (
                  v_org_id,
                  v_invoice_id,
                  v_item_description,
                  NULL,
                  v_item_qty,
                  v_item_unit_price,
                  v_item_position
                );
              ELSE
                INSERT INTO public.invoice_items (
                  invoice_id,
                  name,
                  description,
                  quantity,
                  unit_price,
                  position
                )
                VALUES (
                  v_invoice_id,
                  v_item_description,
                  NULL,
                  v_item_qty,
                  v_item_unit_price,
                  v_item_position
                );
              END IF;
              
              v_item_position := v_item_position + 1;
            END IF;
          END LOOP;

          -- Build success result
          v_result := jsonb_build_object(
            'rowId', v_row_id,
            'invoice_number', v_invoice_number,
            'status', 'ok',
            'action', 'update',
            'invoice_id', v_invoice_id,
            'error', NULL
          );
        ELSE
          -- Insert new invoice
          -- REMOVED: total_paid, outstanding_amount, payment_state (computed by invoices_view)
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            INSERT INTO public.invoices (
              workspace_id,
              organization_id,
              client_id,
              invoice_number,
              issue_date,
              due_date,
              currency,
              status,
              notes,
              amount
            )
            VALUES (
              p_workspace_id,
              v_org_id,
              v_client_id,
              v_invoice_number,
              v_issue_date,
              v_due_date,
              v_currency,
              v_status,
              v_notes,
              v_total
            )
            RETURNING id INTO v_invoice_id;
          ELSE
            INSERT INTO public.invoices (
              workspace_id,
              client_id,
              invoice_number,
              issue_date,
              due_date,
              currency,
              status,
              notes,
              amount
            )
            VALUES (
              p_workspace_id,
              v_client_id,
              v_invoice_number,
              v_issue_date,
              v_due_date,
              v_currency,
              v_status,
              v_notes,
              v_total
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
                  organization_id,
                  invoice_id,
                  name,
                  description,
                  quantity,
                  unit_price,
                  position
                )
                VALUES (
                  v_org_id,
                  v_invoice_id,
                  v_item_description,
                  NULL,
                  v_item_qty,
                  v_item_unit_price,
                  v_item_position
                );
              ELSE
                INSERT INTO public.invoice_items (
                  invoice_id,
                  name,
                  description,
                  quantity,
                  unit_price,
                  position
                )
                VALUES (
                  v_invoice_id,
                  v_item_description,
                  NULL,
                  v_item_qty,
                  v_item_unit_price,
                  v_item_position
                );
              END IF;
              
              v_item_position := v_item_position + 1;
            END IF;
          END LOOP;

          -- Build success result
          v_result := jsonb_build_object(
            'rowId', v_row_id,
            'invoice_number', v_invoice_number,
            'status', 'ok',
            'action', 'insert',
            'invoice_id', v_invoice_id,
            'error', NULL
          );
        END IF;
      ELSE
        -- Validation error
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'invoice_number', COALESCE(v_invoice_number, ''),
          'status', 'failed',
          'action', 'fail',
          'invoice_id', NULL,
          'error', v_err
        );
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Catch per-invoice exceptions
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'invoice_number', COALESCE(v_invoice_number, ''),
          'status', 'failed',
          'action', 'fail',
          'invoice_id', NULL,
          'error', SQLERRM
        );
    END;

    -- Append result
    IF v_result IS NOT NULL THEN
      v_results := v_results || jsonb_build_array(v_result);
    END IF;
  END LOOP;

  -- Return results for ALL invoices
  RETURN v_results;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_import_invoices TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_invoices IS 
  'Executes invoice import with per-invoice error handling. Each element in p_rows represents ONE invoice group with items array. Transaction-safe: invoice + items commit together or not at all. Returns JSONB array with results for EVERY input invoice: { rowId, invoice_number, status: ok|failed, action: insert|update|fail, invoice_id, error }. Prevents updates to archived invoices. Never references workspaces.organization_id.';

