-- ============================================================================
-- NO-OP: rpc_import_payments already unified in 20260106150000
-- ============================================================================
-- 
-- This migration is a no-op. The canonical rpc_import_payments function
-- is already defined in migration 20260106150000_fix_rpc_import_payments_net_amount.sql
-- with signature: (p_workspace_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT false)
-- Note: PostgreSQL requires default parameters to come after non-default parameters
-- Returns: jsonb
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Skipping rpc_import_payments net_amount fix: function already unified in 20260106150000.';
END
$$;

-- Keep old definition commented for reference (do not execute)
/*
CREATE OR REPLACE FUNCTION public.rpc_import_payments(
  p_workspace_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_org_id boolean;
  v_org_id uuid;
  
  v_row jsonb;
  v_rowid text;
  
  v_invoice_number text;
  v_invoice_id uuid;
  v_client_id uuid;  -- From invoice, not CSV
  
  v_payment_id uuid;
  
  v_amount numeric;
  v_currency text;
  v_method text;
  v_provider text;
  v_status text;
  v_transaction_id text;
  v_payment_date date;
  v_notes text;
  
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- Detect if payments has organization_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;
  
  -- Get workspace organization_id (only if needed)
  IF v_has_org_id THEN
    SELECT organization_id INTO v_org_id
    FROM workspaces
    WHERE id = p_workspace_id
    LIMIT 1;
    
    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'errors', jsonb_build_array('Workspace is missing organization_id.'),
        'results', '[]'::jsonb
      );
    END IF;
  END IF;
  
  -- Validate p_rows is an array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('p_rows must be a JSON array'),
      'results', '[]'::jsonb
    );
  END IF;
  
  -- Process each row
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_rowid := COALESCE(v_row->>'rowId', v_row->>'row_id', NULL);
    v_payment_id := NULL;
    
    BEGIN
      -- Extract row data
      v_invoice_number := NULLIF(TRIM(COALESCE(v_row->>'invoice_number', '')), '');
      v_amount := (NULLIF(v_row->>'amount', ''))::numeric;
      v_currency := NULLIF(UPPER(TRIM(COALESCE(v_row->>'currency', ''))), '');
      v_method := NULLIF(TRIM(COALESCE(v_row->>'method', '')), '');
      v_provider := NULLIF(TRIM(COALESCE(v_row->>'payment_provider', '')), '');
      v_status := LOWER(TRIM(COALESCE(v_row->>'status', 'completed')));
      v_transaction_id := NULLIF(TRIM(COALESCE(v_row->>'transaction_id', '')), '');
      v_payment_date := (NULLIF(v_row->>'payment_date', ''))::date;
      v_notes := NULLIF(TRIM(COALESCE(v_row->>'notes', '')), '');
      
      -- Validate required fields
      IF v_invoice_number IS NULL THEN
        RAISE EXCEPTION 'Missing invoice_number';
      END IF;
      IF v_amount IS NULL THEN
        RAISE EXCEPTION 'Missing amount';
      END IF;
      IF v_payment_date IS NULL THEN
        RAISE EXCEPTION 'Missing payment_date';
      END IF;
      
      -- Resolve invoice_id by workspace_id + invoice_number
      -- Also get client_id from invoice (not from CSV)
      SELECT id, client_id INTO v_invoice_id, v_client_id
      FROM invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = v_invoice_number
        AND archived_at IS NULL
      LIMIT 1;
      
      IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'Invoice not found: %', v_invoice_number;
      END IF;
      
      -- Default currency to USD if blank
      IF v_currency IS NULL THEN
        v_currency := 'USD';
      END IF;
      
      -- Check if payment with same transaction_id already exists
      IF v_transaction_id IS NOT NULL THEN
        SELECT id INTO v_payment_id
        FROM payments
        WHERE workspace_id = p_workspace_id
          AND transaction_id = v_transaction_id
          AND archived_at IS NULL
        LIMIT 1;
        
        IF v_payment_id IS NOT NULL THEN
          -- UPDATE existing payment (do NOT mention net_amount - generated always)
          UPDATE payments
          SET invoice_id = v_invoice_id,
              client_id = v_client_id,
              amount = v_amount,
              currency = v_currency,
              method = v_method,
              payment_provider = v_provider,
              status = v_status,
              payment_date = v_payment_date,
              notes = v_notes,
              updated_at = NOW()
          WHERE id = v_payment_id;
          
          -- Add result and continue to next row
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'rowId', v_rowid,
            'row_id', v_rowid,
            'status', 'ok',
            'payment_id', v_payment_id,
            'error', NULL
          ));
          
          -- Skip INSERT - go to next iteration
          CONTINUE;
        END IF;
      END IF;
      
      -- INSERT new payment (do NOT mention net_amount - generated always)
      -- Note: net_amount is GENERATED ALWAYS AS (amount - transaction_fee)
      IF v_has_org_id THEN
        INSERT INTO payments (
          workspace_id,
          organization_id,
          invoice_id,
          client_id,
          amount,
          currency,
          method,
          payment_provider,
          status,
          transaction_id,
          payment_date,
          notes,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_org_id,
          v_invoice_id,
          v_client_id,
          v_amount,
          v_currency,
          v_method,
          v_provider,
          v_status,
          v_transaction_id,
          v_payment_date,
          v_notes,
          NULL
        )
        RETURNING id INTO v_payment_id;
      ELSE
        INSERT INTO payments (
          workspace_id,
          invoice_id,
          client_id,
          amount,
          currency,
          method,
          payment_provider,
          status,
          transaction_id,
          payment_date,
          notes,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_invoice_id,
          v_client_id,
          v_amount,
          v_currency,
          v_method,
          v_provider,
          v_status,
          v_transaction_id,
          v_payment_date,
          v_notes,
          NULL
        )
        RETURNING id INTO v_payment_id;
      END IF;
      
      -- Add success result
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_rowid,
        'row_id', v_rowid,
        'status', 'ok',
        'payment_id', v_payment_id,
        'error', NULL
      ));
      
    EXCEPTION WHEN OTHERS THEN
      -- Per-row error handling: catch and continue, don't throw
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_rowid,
        'row_id', v_rowid,
        'status', 'failed',
        'payment_id', NULL,
        'error', SQLERRM
      ));
    END;
  END LOOP;
  
  -- Return JSON with ok=true and results array
  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'results', v_results
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_payments(uuid, jsonb) IS 
  'Imports payments from CSV/TSV. Resolves invoice by workspace_id + invoice_number. Gets client_id from invoice. Does NOT insert/update net_amount (generated always). Returns JSON with ok, results array. Per-row error handling.';
*/
