-- ============================================================================
-- Canonical rpc_import_payments function
-- ============================================================================
-- 
-- Unified function for importing payments from CSV/TSV.
-- 
-- Signature: rpc_import_payments(p_workspace_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT false)
-- Note: Logical order requested: (p_workspace_id, p_dry_run, p_rows)
--       PostgreSQL requires: default parameters must come after non-default parameters
--       Actual signature: (p_workspace_id, p_rows, p_dry_run) with p_dry_run last
-- Returns: jsonb with structure: { ok, dry_run, rows_received, inserted, skipped, errors, results: [{ rowId, status, payment_id, error }] }
-- 
-- Rules:
-- - NEVER references net_amount in INSERT/UPDATE (generated always or computed)
-- - transaction_fee: only inserted if column exists AND value provided
-- - Works even if organization_id column exists (optional insert)
-- - Does not throw for row-level issues; only fatal if workspace missing
-- - Uses transaction_id deduplication via partial unique index (workspace_id, transaction_id) WHERE archived_at IS NULL AND transaction_id IS NOT NULL
-- - Resolves invoice by invoice_number (trim, normalize)
-- - Resolves client_id from invoice (do not trust CSV)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_payments(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_org_id boolean;
  v_has_transaction_fee boolean;
  v_org_id uuid;
  
  v_row jsonb;
  v_row_id INTEGER := 0;
  v_row_id_string TEXT;
  v_invoice_number_raw TEXT;
  v_invoice_number TEXT;
  v_invoice_id uuid;
  v_client_id uuid;
  v_payment_id uuid;
  v_payment_date date;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_provider text;
  v_status text;
  v_transaction_id text;
  v_transaction_fee numeric;
  v_notes text;
  v_created_at timestamptz;
  v_archived_at timestamptz;
  v_invoice_currency text;
  
  v_error_msg text;
  v_date_str text;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_rows_received INTEGER := 0;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  -- Validate p_rows is a JSONB array
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'dry_run', COALESCE(p_dry_run, false),
      'rows_received', 0,
      'inserted', 0,
      'skipped', 0,
      'errors', 1,
      'results', jsonb_build_array(jsonb_build_object(
        'rowId', '0',
        'status', 'failed',
        'payment_id', NULL,
        'error', 'p_rows must be a JSON array'
      ))
    );
  END IF;
  
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
  
  -- Detect if payments table has optional columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'transaction_fee'
  ) INTO v_has_transaction_fee;
  
  -- Get workspace organization_id (only if needed)
  IF v_has_org_id THEN
    SELECT organization_id INTO v_org_id
    FROM workspaces
    WHERE id = p_workspace_id
    LIMIT 1;
  END IF;
  
  -- Validate workspace exists (fatal error)
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_workspace_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'dry_run', false,
      'rows_received', v_rows_received,
      'inserted', 0,
      'skipped', v_rows_received,
      'errors', v_rows_received,
      'results', jsonb_build_array(jsonb_build_object(
        'rowId', '0',
        'status', 'failed',
        'payment_id', NULL,
        'error', format('Workspace not found: %s', p_workspace_id)
      ))
    );
  END IF;
  
  -- Process each row
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_id := v_row_id + 1;
    v_payment_id := NULL;
    v_error_msg := NULL;
    v_row_id_string := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row_id::TEXT);
    
    BEGIN
      -- Extract and validate required fields
      v_invoice_number_raw := NULLIF(TRIM(COALESCE(v_row->>'invoice_number', '')), '');
      v_date_str := NULLIF(TRIM(COALESCE(v_row->>'payment_date', '')), '');
      v_amount := NULLIF(COALESCE(v_row->>'amount', ''), '')::numeric;
      
      -- Validate invoice_number
      IF v_invoice_number_raw IS NULL OR v_invoice_number_raw = '' THEN
        v_error_msg := 'Missing invoice_number';
        v_skipped := v_skipped + 1;
        v_errors := v_errors + 1;
      ELSE
        -- Parse invoice_number: trim, if contains spaces, take first token
        v_invoice_number := v_invoice_number_raw;
        IF POSITION(' ' IN v_invoice_number) > 0 THEN
          v_invoice_number := SPLIT_PART(v_invoice_number, ' ', 1);
        END IF;
        
        -- Parse payment_date (accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY)
        IF v_date_str IS NULL OR v_date_str = '' THEN
          v_error_msg := 'Missing payment_date';
          v_skipped := v_skipped + 1;
          v_errors := v_errors + 1;
        ELSE
          -- Try ISO format first (YYYY-MM-DD)
          BEGIN
            v_payment_date := v_date_str::date;
          EXCEPTION WHEN OTHERS THEN
            -- Try MM/DD/YYYY or M/D/YYYY
            IF v_date_str LIKE '%/%' THEN
              BEGIN
                v_payment_date := TO_DATE(v_date_str, 'MM/DD/YYYY');
              EXCEPTION WHEN OTHERS THEN
                BEGIN
                  v_payment_date := TO_DATE(v_date_str, 'M/D/YYYY');
                EXCEPTION WHEN OTHERS THEN
                  v_error_msg := format('Invalid date format: %s (expected YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, or DD-MM-YYYY)', v_date_str);
                  v_skipped := v_skipped + 1;
                  v_errors := v_errors + 1;
                END;
              END;
            -- Try DD-MM-YYYY
            ELSIF v_date_str LIKE '%-%-%' AND POSITION('-' IN v_date_str) < 5 THEN
              BEGIN
                v_payment_date := TO_DATE(v_date_str, 'DD-MM-YYYY');
              EXCEPTION WHEN OTHERS THEN
                v_error_msg := format('Invalid date format: %s (expected YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, or DD-MM-YYYY)', v_date_str);
                v_skipped := v_skipped + 1;
                v_errors := v_errors + 1;
              END;
            ELSE
              v_error_msg := format('Invalid date format: %s (expected YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, or DD-MM-YYYY)', v_date_str);
              v_skipped := v_skipped + 1;
              v_errors := v_errors + 1;
            END IF;
          END;
          
          -- Validate amount
          IF v_error_msg IS NULL THEN
            IF v_amount IS NULL THEN
              v_error_msg := 'Missing amount';
              v_skipped := v_skipped + 1;
              v_errors := v_errors + 1;
            ELSIF v_amount <= 0 THEN
              v_error_msg := format('Amount must be positive, got: %s', v_amount);
              v_skipped := v_skipped + 1;
              v_errors := v_errors + 1;
            ELSE
              -- Extract optional fields
              v_currency := NULLIF(UPPER(TRIM(COALESCE(v_row->>'currency', ''))), '');
              v_method := NULLIF(TRIM(COALESCE(v_row->>'method', '')), '');
              v_provider := NULLIF(TRIM(COALESCE(v_row->>'payment_provider', '')), '');
              v_status := LOWER(TRIM(COALESCE(v_row->>'status', 'completed')));
              v_transaction_id := NULLIF(TRIM(COALESCE(v_row->>'transaction_id', '')), '');
              v_notes := NULLIF(TRIM(COALESCE(v_row->>'notes', '')), '');
              IF v_has_transaction_fee THEN
                v_transaction_fee := COALESCE((NULLIF(v_row->>'transaction_fee', ''))::numeric, 0);
              ELSE
                v_transaction_fee := 0;
              END IF;
              v_created_at := NULLIF(COALESCE(v_row->>'created_at', ''), '')::timestamptz;
              v_archived_at := NULLIF(COALESCE(v_row->>'archived_at', ''), '')::timestamptz;
              
              -- Default currency to USD if blank
              IF v_currency IS NULL OR v_currency = '' THEN
                v_currency := 'USD';
              END IF;
              
              -- Validate currency format (3-letter ISO)
              IF LENGTH(v_currency) <> 3 OR NOT (v_currency ~ '^[A-Z]{3}$') THEN
                v_error_msg := format('Invalid currency: %s (must be 3-letter ISO code)', v_currency);
                v_skipped := v_skipped + 1;
                v_errors := v_errors + 1;
              ELSE
                -- Default status to completed if blank
                IF v_status IS NULL OR v_status = '' THEN
                  v_status := 'completed';
                END IF;
                
                -- Validate status
                IF v_status NOT IN ('completed', 'pending', 'failed') THEN
                  v_error_msg := format('Invalid status: %s (must be completed, pending, or failed)', v_status);
                  v_skipped := v_skipped + 1;
                  v_errors := v_errors + 1;
                ELSE
                  -- Find invoice by workspace_id + invoice_number (exact match after normalization)
                  -- Resolve client_id from invoice (do not trust CSV)
                  SELECT id, client_id, currency
                  INTO v_invoice_id, v_client_id, v_invoice_currency
                  FROM invoices
                  WHERE workspace_id = p_workspace_id
                    AND invoice_number = v_invoice_number
                    AND archived_at IS NULL
                  LIMIT 1;
                  
                  IF v_invoice_id IS NULL THEN
                    v_error_msg := format('Invoice not found: %s', v_invoice_number);
                    v_skipped := v_skipped + 1;
                    v_errors := v_errors + 1;
                  ELSE
                    -- Use invoice currency if CSV currency is empty
                    IF v_currency IS NULL OR v_currency = '' THEN
                      v_currency := COALESCE(v_invoice_currency, 'USD');
                    END IF;
                    
                    -- Insert payment using ON CONFLICT for deduplication
                    -- Matches unique index: payments_workspace_transaction_id_unique
                    -- NEVER references net_amount (generated always or computed)
                    IF v_has_org_id AND v_has_transaction_fee THEN
                      INSERT INTO payments (
                        workspace_id,
                        organization_id,
                        invoice_id,
                        client_id,
                        payment_date,
                        amount,
                        currency,
                        method,
                        payment_provider,
                        status,
                        transaction_id,
                        transaction_fee,
                        notes,
                        created_at,
                        archived_at
                      )
                      VALUES (
                        p_workspace_id,
                        v_org_id,
                        v_invoice_id,
                        v_client_id,
                        v_payment_date,
                        v_amount,
                        v_currency,
                        v_method,
                        v_provider,
                        v_status,
                        v_transaction_id,
                        v_transaction_fee,
                        v_notes,
                        COALESCE(v_created_at, NOW()),
                        v_archived_at
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
                      INSERT INTO payments (
                        workspace_id,
                        organization_id,
                        invoice_id,
                        client_id,
                        payment_date,
                        amount,
                        currency,
                        method,
                        payment_provider,
                        status,
                        transaction_id,
                        notes,
                        created_at,
                        archived_at
                      )
                      VALUES (
                        p_workspace_id,
                        v_org_id,
                        v_invoice_id,
                        v_client_id,
                        v_payment_date,
                        v_amount,
                        v_currency,
                        v_method,
                        v_provider,
                        v_status,
                        v_transaction_id,
                        v_notes,
                        COALESCE(v_created_at, NOW()),
                        v_archived_at
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
                      INSERT INTO payments (
                        workspace_id,
                        invoice_id,
                        client_id,
                        payment_date,
                        amount,
                        currency,
                        method,
                        payment_provider,
                        status,
                        transaction_id,
                        transaction_fee,
                        notes,
                        created_at,
                        archived_at
                      )
                      VALUES (
                        p_workspace_id,
                        v_invoice_id,
                        v_client_id,
                        v_payment_date,
                        v_amount,
                        v_currency,
                        v_method,
                        v_provider,
                        v_status,
                        v_transaction_id,
                        v_transaction_fee,
                        v_notes,
                        COALESCE(v_created_at, NOW()),
                        v_archived_at
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
                      INSERT INTO payments (
                        workspace_id,
                        invoice_id,
                        client_id,
                        payment_date,
                        amount,
                        currency,
                        method,
                        payment_provider,
                        status,
                        transaction_id,
                        notes,
                        created_at,
                        archived_at
                      )
                      VALUES (
                        p_workspace_id,
                        v_invoice_id,
                        v_client_id,
                        v_payment_date,
                        v_amount,
                        v_currency,
                        v_method,
                        v_provider,
                        v_status,
                        v_transaction_id,
                        v_notes,
                        COALESCE(v_created_at, NOW()),
                        v_archived_at
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
                    
                    IF v_payment_id IS NOT NULL THEN
                      v_inserted := v_inserted + 1;
                    END IF;
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Catch any other errors and return as failed row (do not throw)
      v_error_msg := SQLERRM;
      v_skipped := v_skipped + 1;
      v_errors := v_errors + 1;
    END;
    
    -- Build result object for this row (always return a result, even on error)
    IF v_error_msg IS NULL AND v_payment_id IS NOT NULL THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id_string,
        'status', 'ok',
        'payment_id', v_payment_id,
        'error', NULL
      );
    ELSE
      v_result := jsonb_build_object(
        'rowId', v_row_id_string,
        'status', 'failed',
        'payment_id', NULL,
        'error', COALESCE(v_error_msg, 'Unknown error')
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

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) IS 
  'Canonical function for importing payments from CSV/TSV. Returns JSONB with ok, dry_run, rows_received, inserted, skipped, errors, and results array. NEVER references net_amount in INSERT/UPDATE. Handles transaction_fee and organization_id conditionally. Uses transaction_id deduplication. Resolves invoice by invoice_number and client_id from invoice. Supports date formats: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY.';

-- Force PostgREST to reload schema
SELECT pg_notify('pgrst', 'reload schema');
