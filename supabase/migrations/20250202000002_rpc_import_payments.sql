-- ============================================================================
-- RPC Function: rpc_import_payments
-- ============================================================================
-- 
-- Executes payment import with transaction-safe upserts.
-- Single transaction - on any error, raises exception (rollback).
-- Uses transaction_id as the deduplication key.
-- 
-- Parameters:
--   p_workspace_id UUID - Workspace ID
--   p_rows JSONB - Array of payment rows as JSONB
-- 
-- JSONB row format:
-- {
--   "row_id": integer,
--   "invoice_number": text,
--   "amount": numeric,
--   "currency": text,
--   "payment_date": date (YYYY-MM-DD),
--   "method": text (nullable),
--   "status": text (default "completed"),
--   "transaction_id": text,
--   "notes": text (nullable),
--   "payment_provider": text (nullable)
-- }
-- 
-- Returns:
--   JSONB array with objects:
--     {
--       "row_id": integer,
--       "payment_id": uuid (nullable),
--       "status": text ('ok' or 'failed')
--     }
-- 
-- Behavior:
-- - Processes each row individually with per-row error handling
-- - Returns a result for EVERY input row (even failed ones)
-- - Resolves invoice_id by invoice_number (workspace scoped)
-- - client_id comes from invoice, not CSV
-- - Inserts or updates payments by (workspace_id, transaction_id)
-- - Ignores archived payments
-- - Catches errors per row and continues processing (does not rollback on single row failure)
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
BEGIN
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
        -- Matches unique index: payments_workspace_transaction_id_unique
        -- on (workspace_id, transaction_id) where archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != ''
        -- PostgreSQL automatically uses the partial unique index when the inserted row matches the index conditions
        -- For imported payments: transaction_fee=0, net_amount=amount (no fees deducted)
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
          0,  -- transaction_fee = 0 for imported payments
          v_amount,  -- net_amount = amount (no fees deducted for imports)
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
          transaction_fee = EXCLUDED.transaction_fee,
          net_amount = EXCLUDED.net_amount,
          updated_at = NOW()
        RETURNING id INTO v_payment_id;
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

-- Add comment
COMMENT ON FUNCTION public.rpc_import_payments(uuid, jsonb) IS 
  'Executes payment import with per-row error handling. Returns a result for every input row. Uses transaction_id as deduplication key. Returns JSONB with rowId, payment_id, status (ok|error), and error message.';

