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
  RAISE NOTICE 'Skipping rpc_import_payments v2 fix: function already unified in 20260106150000.';
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
SET search_path TO 'public'
AS $$
DECLARE
  v_has_org_id boolean;
  v_org_id uuid;
  
  v_row jsonb;
  v_row_num integer := 0;
  
  v_invoice_number_raw text;
  v_invoice_number text;
  v_payment_date date;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_provider text;
  v_status text;
  v_transaction_id text;
  v_transaction_fee numeric;
  
  v_invoice_id uuid;
  v_payment_id uuid;
  
  v_errors jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_summary jsonb;
  
  v_insert_count integer := 0;
  v_update_count integer := 0;
  v_skip_count integer := 0;
  v_fail_count integer := 0;
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
        'results', '[]'::jsonb,
        'summary', jsonb_build_object(
          'insert', 0,
          'update', 0,
          'skip', 0,
          'fail', 0
        )
      );
    END IF;
  END IF;
  
  -- Validate p_rows is an array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('p_rows must be a JSON array'),
      'results', '[]'::jsonb,
      'summary', jsonb_build_object(
        'insert', 0,
        'update', 0,
        'skip', 0,
        'fail', 0
      )
    );
  END IF;
  
  -- Process each row
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_num := v_row_num + 1;
    v_payment_id := NULL;
    
    BEGIN
      -- Extract required fields
      v_invoice_number_raw := NULLIF(TRIM(COALESCE(v_row->>'invoice_number', '')), '');
      v_payment_date := (NULLIF(v_row->>'payment_date', ''))::date;
      v_amount := (NULLIF(v_row->>'amount', ''))::numeric;
      
      -- Validate required fields
      IF v_invoice_number_raw IS NULL THEN
        RAISE EXCEPTION 'Row %: Missing invoice_number', v_row_num;
      END IF;
      
      IF v_payment_date IS NULL THEN
        RAISE EXCEPTION 'Row %: Missing payment_date', v_row_num;
      END IF;
      
      IF v_amount IS NULL THEN
        RAISE EXCEPTION 'Row %: Missing amount', v_row_num;
      END IF;
      
      -- Parse invoice_number: trim, if contains spaces, take first token
      v_invoice_number := v_invoice_number_raw;
      IF POSITION(' ' IN v_invoice_number) > 0 THEN
        v_invoice_number := SPLIT_PART(v_invoice_number, ' ', 1);
      END IF;
      
      -- Extract optional fields
      v_currency := NULLIF(UPPER(TRIM(COALESCE(v_row->>'currency', ''))), '');
      v_method := NULLIF(TRIM(COALESCE(v_row->>'method', '')), '');
      v_provider := NULLIF(TRIM(COALESCE(v_row->>'payment_provider', '')), '');
      v_status := LOWER(TRIM(COALESCE(v_row->>'status', 'completed')));
      v_transaction_id := NULLIF(TRIM(COALESCE(v_row->>'transaction_id', '')), '');
      v_transaction_fee := COALESCE((NULLIF(v_row->>'transaction_fee', ''))::numeric, 0);
      
      -- Default currency to USD if blank
      IF v_currency IS NULL THEN
        v_currency := 'USD';
      END IF;
      
      -- Default status to completed if blank
      IF v_status IS NULL OR v_status = '' THEN
        v_status := 'completed';
      END IF;
      
      -- Find invoice by workspace_id + invoice_number (exact match)
      SELECT id INTO v_invoice_id
      FROM invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = v_invoice_number
        AND archived_at IS NULL
      LIMIT 1;
      
      IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'Row %: Invoice not found: %', v_row_num, v_invoice_number;
      END IF;
      
      -- MVP: Only INSERT (no UPDATE logic)
      -- Insert payment WITHOUT net_amount (generated always)
      IF v_has_org_id THEN
        INSERT INTO payments (
          workspace_id,
          organization_id,
          invoice_id,
          payment_date,
          amount,
          currency,
          method,
          payment_provider,
          status,
          transaction_id,
          transaction_fee,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_org_id,
          v_invoice_id,
          v_payment_date,
          v_amount,
          v_currency,
          v_method,
          v_provider,
          v_status,
          v_transaction_id,
          v_transaction_fee,
          NULL
        )
        RETURNING id INTO v_payment_id;
      ELSE
        INSERT INTO payments (
          workspace_id,
          invoice_id,
          payment_date,
          amount,
          currency,
          method,
          payment_provider,
          status,
          transaction_id,
          transaction_fee,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_invoice_id,
          v_payment_date,
          v_amount,
          v_currency,
          v_method,
          v_provider,
          v_status,
          v_transaction_id,
          v_transaction_fee,
          NULL
        )
        RETURNING id INTO v_payment_id;
      END IF;
      
      -- Success: INSERT
      v_insert_count := v_insert_count + 1;
      v_result := jsonb_build_object(
        'row', v_row_num,
        'action', 'INSERT',
        'invoice_number', v_invoice_number,
        'amount', v_amount,
        'date', v_payment_date::text,
        'status', v_status,
        'transaction_id', v_transaction_id,
        'reason', NULL
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Failure: FAIL
      v_fail_count := v_fail_count + 1;
      v_result := jsonb_build_object(
        'row', v_row_num,
        'action', 'FAIL',
        'invoice_number', COALESCE(v_invoice_number, v_invoice_number_raw, ''),
        'amount', COALESCE(v_amount, 0),
        'date', COALESCE(v_payment_date::text, ''),
        'status', COALESCE(v_status, ''),
        'transaction_id', COALESCE(v_transaction_id, NULL),
        'reason', SQLERRM
      );
    END;
    
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;
  
  -- Build summary
  v_summary := jsonb_build_object(
    'insert', v_insert_count,
    'update', 0,  -- MVP: no updates
    'skip', v_skip_count,
    'fail', v_fail_count
  );
  
  -- Return result
  RETURN jsonb_build_object(
    'ok', true,
    'errors', v_errors,
    'results', v_results,
    'summary', v_summary
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_payments(uuid, jsonb) IS 
  'Imports payments from CSV/TSV. Parses invoice_number (trim, take first token if spaces). Does NOT insert/update net_amount (generated always). Returns JSON with ok, errors, results array, and summary. MVP: Only INSERT or FAIL/SKIP (no UPDATE).';
*/

