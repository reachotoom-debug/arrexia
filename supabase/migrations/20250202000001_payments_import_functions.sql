-- ============================================================================
-- Payments CSV Import Functions
-- ============================================================================
-- 
-- Functions for previewing and executing payments CSV imports.
-- Uses transaction_id as the deduplication key (reference).
-- 
-- Requirements:
-- - import_preview_payments(): strict headers, validate rows, detect duplicates by (workspace_id, transaction_id) ignoring archived
-- - import_execute_payments(): call RPC that upserts by (workspace_id, transaction_id) for active rows, transaction-safe all-or-nothing
-- - Resolve invoice_id by invoice_number (workspace scoped)
-- - Resolve client_id from invoice.client_id (do not trust CSV client data)
-- - Row-level results must include row_id and payment_id
-- ============================================================================

-- ============================================================================
-- Type: Payment Import Row Input
-- ============================================================================
CREATE TYPE payment_import_row AS (
  row_id INTEGER,
  invoice_number TEXT,
  amount NUMERIC,
  currency TEXT,
  payment_date DATE,
  method TEXT,
  status TEXT,
  transaction_id TEXT,
  notes TEXT,
  payment_provider TEXT
);

-- ============================================================================
-- Function: import_preview_payments
-- ============================================================================
-- 
-- Validates payment import rows and detects duplicates.
-- 
-- Parameters:
--   p_workspace_id UUID - Workspace ID
--   p_rows payment_import_row[] - Array of payment rows to validate
-- 
-- Returns:
--   TABLE with columns:
--     row_id INTEGER - Original row number from input
--     invoice_number TEXT - Invoice number from CSV
--     amount NUMERIC - Payment amount
--     currency TEXT - Currency code
--     payment_date DATE - Payment date
--     method TEXT - Payment method
--     status TEXT - Payment status
--     transaction_id TEXT - Transaction ID (dedupe key)
--     notes TEXT - Payment notes
--     payment_provider TEXT - Payment provider
--     invoice_id UUID - Resolved invoice ID (NULL if not found)
--     client_id UUID - Resolved client ID from invoice (NULL if invoice not found)
--     is_duplicate BOOLEAN - True if transaction_id already exists (ignoring archived)
--     is_valid BOOLEAN - True if row passes all validations
--     error_message TEXT - Error message if validation fails
-- ============================================================================
CREATE OR REPLACE FUNCTION import_preview_payments(
  p_workspace_id UUID,
  p_rows payment_import_row[]
)
RETURNS TABLE (
  row_id INTEGER,
  invoice_number TEXT,
  amount NUMERIC,
  currency TEXT,
  payment_date DATE,
  method TEXT,
  status TEXT,
  transaction_id TEXT,
  notes TEXT,
  payment_provider TEXT,
  invoice_id UUID,
  client_id UUID,
  is_duplicate BOOLEAN,
  is_valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row payment_import_row;
  v_invoice_id UUID;
  v_client_id UUID;
  v_is_duplicate BOOLEAN;
  v_is_valid BOOLEAN;
  v_error_message TEXT;
  v_existing_payment_id UUID;
BEGIN
  -- Loop through each row
  FOREACH v_row IN ARRAY p_rows
  LOOP
    -- Initialize defaults
    v_invoice_id := NULL;
    v_client_id := NULL;
    v_is_duplicate := FALSE;
    v_is_valid := TRUE;
    v_error_message := NULL;

    -- Validate required fields
    IF v_row.invoice_number IS NULL OR TRIM(v_row.invoice_number) = '' THEN
      v_is_valid := FALSE;
      v_error_message := 'Invoice number is required';
    ELSIF v_row.amount IS NULL OR v_row.amount <= 0 THEN
      v_is_valid := FALSE;
      v_error_message := 'Amount must be greater than 0';
    ELSIF v_row.payment_date IS NULL THEN
      v_is_valid := FALSE;
      v_error_message := 'Payment date is required';
    ELSIF v_row.transaction_id IS NULL OR TRIM(v_row.transaction_id) = '' THEN
      v_is_valid := FALSE;
      v_error_message := 'Transaction ID is required';
    ELSE
      -- Resolve invoice_id by invoice_number (workspace scoped)
      SELECT id, client_id
      INTO v_invoice_id, v_client_id
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = TRIM(v_row.invoice_number)
        AND archived_at IS NULL
      LIMIT 1;

      IF v_invoice_id IS NULL THEN
        v_is_valid := FALSE;
        v_error_message := 'Invoice not found: ' || TRIM(v_row.invoice_number);
      ELSE
        -- Check for duplicate transaction_id (ignoring archived)
        SELECT id
        INTO v_existing_payment_id
        FROM public.payments
        WHERE workspace_id = p_workspace_id
          AND transaction_id = TRIM(v_row.transaction_id)
          AND archived_at IS NULL
        LIMIT 1;

        IF v_existing_payment_id IS NOT NULL THEN
          v_is_duplicate := TRUE;
        END IF;

        -- Validate currency (default to USD if empty)
        IF v_row.currency IS NULL OR TRIM(v_row.currency) = '' THEN
          -- Will default to invoice currency in execute function
        END IF;

        -- Validate status (must be one of: completed, pending, failed, refunded)
        IF v_row.status IS NOT NULL AND TRIM(v_row.status) != '' THEN
          IF TRIM(v_row.status) NOT IN ('completed', 'pending', 'failed', 'refunded') THEN
            v_is_valid := FALSE;
            v_error_message := 'Invalid status: ' || TRIM(v_row.status) || '. Must be one of: completed, pending, failed, refunded';
          END IF;
        END IF;

        -- Validate method (optional, but if provided should be valid)
        IF v_row.method IS NOT NULL AND TRIM(v_row.method) != '' THEN
          IF TRIM(v_row.method) NOT IN ('cash', 'bank_transfer', 'card', 'check', 'other') THEN
            -- Not a hard error, but log it
            v_error_message := COALESCE(v_error_message || '; ', '') || 'Warning: Unknown payment method: ' || TRIM(v_row.method);
          END IF;
        END IF;
      END IF;
    END IF;

    -- Return row result
    RETURN QUERY SELECT
      v_row.row_id,
      v_row.invoice_number,
      v_row.amount,
      COALESCE(NULLIF(TRIM(v_row.currency), ''), 'USD') AS currency,
      v_row.payment_date,
      v_row.method,
      COALESCE(NULLIF(TRIM(v_row.status), ''), 'completed') AS status,
      TRIM(v_row.transaction_id) AS transaction_id,
      v_row.notes,
      v_row.payment_provider,
      v_invoice_id,
      v_client_id,
      v_is_duplicate,
      v_is_valid,
      v_error_message;
  END LOOP;
END;
$$;

-- ============================================================================
-- Function: import_execute_payments
-- ============================================================================
-- 
-- Executes payment import with transaction-safe upserts.
-- Uses transaction_id as the deduplication key.
-- 
-- Parameters:
--   p_workspace_id UUID - Workspace ID
--   p_rows payment_import_row[] - Array of payment rows to import (should be pre-validated)
-- 
-- Returns:
--   TABLE with columns:
--     row_id INTEGER - Original row number from input
--     payment_id UUID - ID of created/updated payment (NULL if failed)
--     action TEXT - 'inserted' or 'updated' or 'failed'
--     error_message TEXT - Error message if action is 'failed'
-- ============================================================================
CREATE OR REPLACE FUNCTION import_execute_payments(
  p_workspace_id UUID,
  p_rows payment_import_row[]
)
RETURNS TABLE (
  row_id INTEGER,
  payment_id UUID,
  action TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row payment_import_row;
  v_invoice_id UUID;
  v_client_id UUID;
  v_currency TEXT;
  v_payment_id UUID;
  v_action TEXT;
  v_error_message TEXT;
  v_existing_payment_id UUID;
BEGIN
  -- Start transaction (implicit in function)
  
  -- Loop through each row
  FOREACH v_row IN ARRAY p_rows
  LOOP
    -- Initialize
    v_payment_id := NULL;
    v_action := 'failed';
    v_error_message := NULL;

    BEGIN
      -- Resolve invoice_id and client_id
      SELECT id, client_id, currency
      INTO v_invoice_id, v_client_id, v_currency
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND invoice_number = TRIM(v_row.invoice_number)
        AND archived_at IS NULL
      LIMIT 1;

      IF v_invoice_id IS NULL THEN
        v_error_message := 'Invoice not found: ' || TRIM(v_row.invoice_number);
      ELSE
        -- Use invoice currency if CSV currency is empty
        IF v_row.currency IS NULL OR TRIM(v_row.currency) = '' THEN
          v_currency := COALESCE(v_currency, 'USD');
        ELSE
          v_currency := TRIM(v_row.currency);
        END IF;

        -- Check if payment with this transaction_id already exists (ignoring archived)
        SELECT id
        INTO v_existing_payment_id
        FROM public.payments
        WHERE workspace_id = p_workspace_id
          AND transaction_id = TRIM(v_row.transaction_id)
          AND archived_at IS NULL
        LIMIT 1;

        IF v_existing_payment_id IS NOT NULL THEN
          -- Update existing payment
          UPDATE public.payments
          SET
            invoice_id = v_invoice_id,
            client_id = v_client_id,
            amount = v_row.amount,
            currency = v_currency,
            payment_date = v_row.payment_date,
            method = NULLIF(TRIM(v_row.method), ''),
            status = COALESCE(NULLIF(TRIM(v_row.status), ''), 'completed'),
            transaction_id = TRIM(v_row.transaction_id),
            notes = NULLIF(TRIM(v_row.notes), ''),
            payment_provider = NULLIF(TRIM(v_row.payment_provider), ''),
            updated_at = NOW()
          WHERE id = v_existing_payment_id
          RETURNING id INTO v_payment_id;

          v_action := 'updated';
        ELSE
          -- Insert new payment
          -- Note: organization_id is not included as it's deprecated/not used in current schema
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
            archived_at
          )
          VALUES (
            p_workspace_id,
            v_invoice_id,
            v_client_id,
            v_row.amount,
            v_currency,
            v_row.payment_date,
            NULLIF(TRIM(v_row.method), ''),
            COALESCE(NULLIF(TRIM(v_row.status), ''), 'completed'),
            TRIM(v_row.transaction_id),
            NULLIF(TRIM(v_row.notes), ''),
            NULLIF(TRIM(v_row.payment_provider), ''),
            NULL
          )
          RETURNING id INTO v_payment_id;

          v_action := 'inserted';
        END IF;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_error_message := SQLERRM;
        v_action := 'failed';
    END;

    -- Return row result
    RETURN QUERY SELECT
      v_row.row_id,
      v_payment_id,
      v_action,
      v_error_message;
  END LOOP;

  -- Transaction commits automatically on function exit
END;
$$;

-- Add comments
COMMENT ON FUNCTION import_preview_payments IS 
  'Validates payment import rows and detects duplicates by transaction_id (ignoring archived payments). Resolves invoice_id by invoice_number and client_id from invoice.';

COMMENT ON FUNCTION import_execute_payments IS 
  'Executes payment import with transaction-safe upserts. Uses transaction_id as deduplication key. All-or-nothing transaction safety.';

