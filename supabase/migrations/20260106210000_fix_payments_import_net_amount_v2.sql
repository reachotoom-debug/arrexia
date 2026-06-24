-- ============================================================================
-- Fix payments import RPC: Remove net_amount from INSERT
-- ============================================================================
-- 
-- This migration fixes the rpc_import_payments function to:
-- - Remove net_amount from INSERT (let DB default or compute it)
-- - Remove transaction_fee from INSERT (let DB default)
-- - Only insert columns that are provided in the CSV/TSV import
-- - Add organization_id support if column exists
-- 
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_import_payments(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row JSONB;
  v_row_id INTEGER;
  v_row_id_string TEXT;
  v_invoice_number TEXT;
  v_amount NUMERIC;
  v_currency TEXT;
  v_payment_date DATE;
  v_method TEXT;
  v_status TEXT;
  v_transaction_id TEXT;
  v_notes TEXT;
  v_payment_provider TEXT;
  v_invoice_id UUID;
  v_client_id UUID;
  v_invoice_currency TEXT;
  v_payment_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_message TEXT;
  
  -- Multi-tenant: organization_id from workspace
  v_org_id UUID;
  v_has_org_id BOOLEAN;
BEGIN
  -- Check if organization_id column exists in payments table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'organization_id'
  ) INTO v_has_org_id;
  
  -- Fetch workspace organization_id
  IF v_has_org_id THEN
    SELECT organization_id INTO v_org_id
    FROM workspaces
    WHERE id = p_workspace_id
    LIMIT 1;
  END IF;

  -- Loop through each row in the JSONB array
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Initialize per-row variables
    v_payment_id := NULL;
    v_error_message := NULL;
    
    -- Extract rowId (string) for stable matching - prefer rowId, fallback to row_id
    v_row_id_string := COALESCE(v_row->>'rowId', (v_row->>'row_id')::TEXT);
    v_row_id := (v_row->>'row_id')::INTEGER;
    
    BEGIN
      -- Extract row data from JSONB
      v_invoice_number := TRIM(v_row->>'invoice_number');
      v_amount := (v_row->>'amount')::NUMERIC;
      v_currency := TRIM(v_row->>'currency');
      v_payment_date := (v_row->>'payment_date')::DATE;
      v_method := NULLIF(TRIM(v_row->>'method'), '');
      v_status := COALESCE(NULLIF(TRIM(v_row->>'status'), ''), 'completed');
      v_transaction_id := TRIM(v_row->>'transaction_id');
      v_notes := NULLIF(TRIM(v_row->>'notes'), '');
      v_payment_provider := NULLIF(TRIM(v_row->>'payment_provider'), '');

      -- Resolve invoice_id by invoice_number (workspace scoped)
      -- client_id must come from invoice, not CSV
      SELECT id, client_id, currency
      INTO v_invoice_id, v_client_id, v_invoice_currency
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = v_invoice_number
        AND archived_at IS NULL
      LIMIT 1;

      -- Return error if invoice not found (don't throw - catch per row)
      IF v_invoice_id IS NULL THEN
        v_error_message := 'Invoice not found: ' || v_invoice_number;
      ELSE
        -- Use invoice currency if CSV currency is empty
        IF v_currency IS NULL OR v_currency = '' THEN
          v_currency := COALESCE(v_invoice_currency, 'USD');
        END IF;

        -- Insert or update payment using ON CONFLICT
        -- DO NOT insert into net_amount, transaction_fee, or any computed/generated columns
        -- Let DB handle defaults for created_at, updated_at
        IF v_has_org_id THEN
          INSERT INTO public.payments (
            workspace_id,
            organization_id,
            invoice_id,
            client_id,  -- client_id from invoice, not CSV
            amount,
            currency,
            payment_date,
            method,
            status,
            transaction_id,
            notes,
            payment_provider,
            archived_at
          )
          VALUES (
            p_workspace_id,
            v_org_id,
            v_invoice_id,
            v_client_id,
            v_amount,
            v_currency,
            v_payment_date,
            v_method,
            v_status,
            v_transaction_id,
            v_notes,
            v_payment_provider,
            NULL  -- Ensure archived_at is NULL for the unique index
          )
          ON CONFLICT (workspace_id, transaction_id)
          DO UPDATE SET
            invoice_id = EXCLUDED.invoice_id,
            client_id = EXCLUDED.client_id,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            payment_date = EXCLUDED.payment_date,
            method = EXCLUDED.method,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            payment_provider = EXCLUDED.payment_provider,
            updated_at = NOW()
          RETURNING id INTO v_payment_id;
        ELSE
          INSERT INTO public.payments (
            workspace_id,
            invoice_id,
            client_id,  -- client_id from invoice, not CSV
            amount,
            currency,
            payment_date,
            method,
            status,
            transaction_id,
            notes,
            payment_provider,
            archived_at
          )
          VALUES (
            p_workspace_id,
            v_invoice_id,
            v_client_id,
            v_amount,
            v_currency,
            v_payment_date,
            v_method,
            v_status,
            v_transaction_id,
            v_notes,
            v_payment_provider,
            NULL  -- Ensure archived_at is NULL for the unique index
          )
          ON CONFLICT (workspace_id, transaction_id)
          DO UPDATE SET
            invoice_id = EXCLUDED.invoice_id,
            client_id = EXCLUDED.client_id,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            payment_date = EXCLUDED.payment_date,
            method = EXCLUDED.method,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            payment_provider = EXCLUDED.payment_provider,
            updated_at = NOW()
          RETURNING id INTO v_payment_id;
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Catch any error for this row and continue processing other rows
        v_error_message := SQLERRM;
        v_payment_id := NULL;
    END;

    -- Build result object for this row (always return a result, even on error)
    IF v_error_message IS NULL THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id_string,
        'row_id', v_row_id,
        'payment_id', v_payment_id,
        'status', 'ok',
        'error', NULL
      );
    ELSE
      v_result := jsonb_build_object(
        'rowId', v_row_id_string,
        'row_id', v_row_id,
        'payment_id', NULL,
        'status', 'failed',
        'error', v_error_message
      );
    END IF;

    -- Append to results array
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  -- Return JSONB array of results (one entry per input row)
  RETURN v_results;
END;
$$;

COMMENT ON FUNCTION public.rpc_import_payments(uuid, jsonb) IS 
  'Executes payment import with per-row error handling. Returns a result for every input row. Uses transaction_id as deduplication key. Does NOT insert into net_amount or transaction_fee (let DB handle defaults). Returns JSONB with rowId, payment_id, status (ok|error), and error message.';

