-- ============================================================================
-- Backfill invoices.workspace_id and payments.workspace_id, then add NOT NULL constraints
-- ============================================================================
-- 
-- This migration:
-- 1. Backfills invoices.workspace_id from clients.workspace_id
-- 2. Backfills payments.workspace_id from invoices.workspace_id
-- 3. Adds NOT NULL constraints if all values are backfilled
--
-- IMPORTANT: Does NOT guess random workspace_id. Only infers from actual relations.
-- ============================================================================

-- Step 1: Count invoices with NULL workspace_id before backfill
DO $$
DECLARE
  v_invoice_null_count_before INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invoice_null_count_before
  FROM public.invoices
  WHERE workspace_id IS NULL;
  
  RAISE NOTICE 'Invoices with NULL workspace_id before backfill: %', v_invoice_null_count_before;
END $$;

-- Step 2: Update invoices.workspace_id from clients.workspace_id (preferred source)
UPDATE public.invoices i
SET workspace_id = c.workspace_id
FROM public.clients c
WHERE i.workspace_id IS NULL 
  AND i.client_id = c.id 
  AND c.workspace_id IS NOT NULL;

-- Step 3: Count invoices with NULL workspace_id after backfill
DO $$
DECLARE
  v_invoice_null_count_after INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invoice_null_count_after
  FROM public.invoices
  WHERE workspace_id IS NULL;
  
  RAISE NOTICE 'Invoices with NULL workspace_id after backfill: %', v_invoice_null_count_after;
  
  IF v_invoice_null_count_after > 0 THEN
    RAISE WARNING 'Some invoices still have NULL workspace_id. These cannot be inferred from clients.';
  END IF;
END $$;

-- Step 4: Add NOT NULL constraint on invoices.workspace_id (only if no rows remain null)
DO $$
DECLARE
  v_invoice_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invoice_null_count
  FROM public.invoices
  WHERE workspace_id IS NULL;
  
  IF v_invoice_null_count = 0 THEN
    ALTER TABLE public.invoices
      ALTER COLUMN workspace_id SET NOT NULL;
    
    RAISE NOTICE 'Added NOT NULL constraint on invoices.workspace_id';
  ELSE
    RAISE WARNING 'Cannot add NOT NULL constraint: % invoices still have NULL workspace_id', v_invoice_null_count;
  END IF;
END $$;

-- Step 5: Count payments with NULL workspace_id before backfill
DO $$
DECLARE
  v_payment_null_count_before INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_payment_null_count_before
  FROM public.payments
  WHERE workspace_id IS NULL;
  
  RAISE NOTICE 'Payments with NULL workspace_id before backfill: %', v_payment_null_count_before;
END $$;

-- Step 6: Update payments.workspace_id from invoices.workspace_id
UPDATE public.payments p
SET workspace_id = i.workspace_id
FROM public.invoices i
WHERE p.workspace_id IS NULL 
  AND p.invoice_id = i.id 
  AND i.workspace_id IS NOT NULL;

-- Step 7: Count payments with NULL workspace_id after backfill
DO $$
DECLARE
  v_payment_null_count_after INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_payment_null_count_after
  FROM public.payments
  WHERE workspace_id IS NULL;
  
  RAISE NOTICE 'Payments with NULL workspace_id after backfill: %', v_payment_null_count_after;
  
  IF v_payment_null_count_after > 0 THEN
    RAISE WARNING 'Some payments still have NULL workspace_id. These cannot be inferred from invoices.';
  END IF;
END $$;

-- Step 8: Add NOT NULL constraint on payments.workspace_id (only if no rows remain null)
DO $$
DECLARE
  v_payment_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_payment_null_count
  FROM public.payments
  WHERE workspace_id IS NULL;
  
  IF v_payment_null_count = 0 THEN
    ALTER TABLE public.payments
      ALTER COLUMN workspace_id SET NOT NULL;
    
    RAISE NOTICE 'Added NOT NULL constraint on payments.workspace_id';
  ELSE
    RAISE WARNING 'Cannot add NOT NULL constraint: % payments still have NULL workspace_id', v_payment_null_count;
  END IF;
END $$;

-- ============================================================================
-- Verification Queries (run these manually to verify the migration)
-- ============================================================================

-- 1) Check remaining NULL counts for invoices
-- Expected result: Should be 0 after successful backfill
-- SELECT COUNT(*) AS remaining_null_workspace_id
-- FROM public.invoices
-- WHERE workspace_id IS NULL;

-- 2) Check remaining NULL counts for payments
-- Expected result: Should be 0 after successful backfill
-- SELECT COUNT(*) AS remaining_null_workspace_id
-- FROM public.payments
-- WHERE workspace_id IS NULL;

-- 3) Verify invoices updated from clients
-- SELECT 
--   i.id,
--   i.invoice_number,
--   i.workspace_id AS invoice_workspace_id,
--   c.workspace_id AS client_workspace_id,
--   CASE WHEN i.workspace_id = c.workspace_id THEN 'MATCH' ELSE 'MISMATCH' END AS status
-- FROM public.invoices i
-- JOIN public.clients c ON c.id = i.client_id
-- WHERE i.client_id IS NOT NULL
-- ORDER BY i.created_at DESC
-- LIMIT 20;

-- 4) Verify payments updated from invoices
-- SELECT 
--   p.id,
--   p.invoice_id,
--   p.workspace_id AS payment_workspace_id,
--   i.workspace_id AS invoice_workspace_id,
--   CASE WHEN p.workspace_id = i.workspace_id THEN 'MATCH' ELSE 'MISMATCH' END AS status
-- FROM public.payments p
-- JOIN public.invoices i ON i.id = p.invoice_id
-- WHERE p.invoice_id IS NOT NULL
-- ORDER BY p.created_at DESC
-- LIMIT 20;

-- 5) Verify constraints exist
-- SELECT 
--   table_name,
--   column_name,
--   is_nullable,
--   data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('invoices', 'payments')
--   AND column_name = 'workspace_id'
-- ORDER BY table_name;

