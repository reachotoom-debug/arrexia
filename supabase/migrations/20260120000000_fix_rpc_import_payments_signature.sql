-- ============================================================================
-- NO-OP: rpc_import_payments already unified in 20260106150000
-- ============================================================================
-- 
-- This migration is a no-op. The canonical rpc_import_payments function
-- is already defined in migration 20260106150000_fix_rpc_import_payments_net_amount.sql
-- with signature: (p_workspace_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT false)
-- Returns: jsonb
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Skipping rpc_import_payments signature fix: function already unified in 20260106150000.';
END
$$;

-- Keep old definition commented for reference (do not execute)
/*
-- Drop old function
DROP FUNCTION IF EXISTS public.rpc_import_payments(UUID, JSONB);

-- Create new function with correct signature
CREATE OR REPLACE FUNCTION public.rpc_import_payments(
  p_workspace_id UUID,
  p_rows JSONB,
  p_dry_run BOOLEAN DEFAULT FALSE
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
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
  v_rows_received INTEGER;
BEGIN
  -- Get row count
  v_rows_received := jsonb_array_length(p_rows);
  
  -- If dry_run, return structure without inserting
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'rows_received', v_rows_received,
      'inserted', 0,
      'skipped', 0,
      'errors', 0,
      'results', v_results
    );
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
        v_skipped := v_skipped + 1;
        v_errors := v_errors + 1;
      ELSE
        -- Use invoice currency if CSV currency is empty
        IF v_currency IS NULL OR v_currency = '' THEN
          v_currency := COALESCE(v_invoice_currency, 'USD');
        END IF;

        -- Insert or update payment using ON CONFLICT
        -- Matches unique index: payments_workspace_transaction_id_unique
        INSERT INTO public.payments (
          workspace_id,
          invoice_id,
          client_id,
          amount,
          currency,
          payment_date,
          method,
          status,
          transaction_id,
          notes,
          payment_provider,
          transaction_fee,
          net_amount,
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
          0,
          v_amount,
          NULL
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
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          payment_provider = EXCLUDED.payment_provider,
          transaction_fee = EXCLUDED.transaction_fee,
          net_amount = EXCLUDED.net_amount,
          updated_at = NOW()
        RETURNING id INTO v_payment_id;
        
        IF v_payment_id IS NOT NULL THEN
          v_inserted := v_inserted + 1;
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Catch any error for this row and continue processing other rows
        v_error_message := SQLERRM;
        v_payment_id := NULL;
        v_skipped := v_skipped + 1;
        v_errors := v_errors + 1;
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

  -- Return structured JSONB response
  RETURN jsonb_build_object(
    'ok', (v_errors = 0),
    'dry_run', false,
    'rows_received', v_rows_received,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors,
    'results', v_results
  );
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_payments(UUID, JSONB, BOOLEAN) IS 
  'Executes payment import with per-row error handling. Returns structured JSONB with ok, dry_run, rows_received, inserted, skipped, errors, and results array. Uses transaction_id as deduplication key.';

-- Force PostgREST to reload schema
SELECT pg_notify('pgrst', 'reload schema');
*/
