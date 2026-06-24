-- ============================================================================
-- Backfill NULL workspace_id values across multi-tenant tables
-- ============================================================================
-- 
-- This migration backfills NULL workspace_id values by:
-- 1. Inferring from relationships (preferred)
-- 2. Using single workspace as fallback (only if exactly one workspace exists)
--
-- IMPORTANT: Does NOT add NOT NULL constraints. Run verification queries first.
--
-- Tables processed in order:
-- 1. invoices (from clients, payments, or single workspace)
-- 2. invoice_items (from invoices)
-- 3. payments (from invoices, clients, or single workspace)
-- 4. clients (from invoices, payments, or single workspace)
-- ============================================================================

-- Helper function: Get single workspace ID if exactly one exists, else NULL
DO $$
DECLARE
  v_single_ws_id UUID;
  v_workspace_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_workspace_count FROM public.workspaces;
  
  IF v_workspace_count = 1 THEN
    SELECT id INTO v_single_ws_id FROM public.workspaces LIMIT 1;
  ELSE
    v_single_ws_id := NULL;
  END IF;

  -- Step 1: Backfill invoices.workspace_id
  UPDATE public.invoices i
  SET workspace_id = COALESCE(
    -- First: from clients.workspace_id
    (SELECT c.workspace_id FROM public.clients c WHERE c.id = i.client_id AND c.workspace_id IS NOT NULL LIMIT 1),
    -- Second: from payments.workspace_id (first workspace_id for this invoice)
    (SELECT p.workspace_id FROM public.payments p WHERE p.invoice_id = i.id AND p.workspace_id IS NOT NULL LIMIT 1),
    -- Third: single workspace if exists
    v_single_ws_id
  )
  WHERE i.workspace_id IS NULL
    AND (
      -- Only update if we can infer from relationships or single workspace exists
      EXISTS (SELECT 1 FROM public.clients c WHERE c.id = i.client_id AND c.workspace_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id AND p.workspace_id IS NOT NULL)
      OR v_single_ws_id IS NOT NULL
    );

  -- Step 2: Backfill invoice_items.workspace_id from invoices.workspace_id
  -- (Only if invoice_items table AND workspace_id column exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'invoice_items')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'workspace_id') THEN
    UPDATE public.invoice_items ii
    SET workspace_id = i.workspace_id
    FROM public.invoices i
    WHERE ii.invoice_id = i.id
      AND ii.workspace_id IS NULL
      AND i.workspace_id IS NOT NULL;
  END IF;

  -- Step 3: Backfill payments.workspace_id
  UPDATE public.payments p
  SET workspace_id = COALESCE(
    -- First: from invoices.workspace_id
    (SELECT i.workspace_id FROM public.invoices i WHERE i.id = p.invoice_id AND i.workspace_id IS NOT NULL LIMIT 1),
    -- Second: from clients.workspace_id
    (SELECT c.workspace_id FROM public.clients c WHERE c.id = p.client_id AND c.workspace_id IS NOT NULL LIMIT 1),
    -- Third: single workspace if exists
    v_single_ws_id
  )
  WHERE p.workspace_id IS NULL
    AND (
      -- Only update if we can infer from relationships or single workspace exists
      EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = p.invoice_id AND i.workspace_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.client_id AND c.workspace_id IS NOT NULL)
      OR v_single_ws_id IS NOT NULL
    );

  -- Step 4: Backfill clients.workspace_id
  UPDATE public.clients c
  SET workspace_id = COALESCE(
    -- First: from invoices.workspace_id (first workspace_id for this client)
    (SELECT i.workspace_id FROM public.invoices i WHERE i.client_id = c.id AND i.workspace_id IS NOT NULL LIMIT 1),
    -- Second: from payments.workspace_id (first workspace_id for this client)
    (SELECT p.workspace_id FROM public.payments p WHERE p.client_id = c.id AND p.workspace_id IS NOT NULL LIMIT 1),
    -- Third: single workspace if exists
    v_single_ws_id
  )
  WHERE c.workspace_id IS NULL
    AND (
      -- Only update if we can infer from relationships or single workspace exists
      EXISTS (SELECT 1 FROM public.invoices i WHERE i.client_id = c.id AND i.workspace_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.payments p WHERE p.client_id = c.id AND p.workspace_id IS NOT NULL)
      OR v_single_ws_id IS NOT NULL
    );

  -- Log results
  RAISE NOTICE 'Backfill complete. Single workspace ID: %', v_single_ws_id;
END $$;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification Queries (run these manually to verify the migration)
-- ============================================================================

-- 1) Count NULL workspace_id per table
-- SELECT 
--   'invoices' AS table_name,
--   COUNT(*) AS null_workspace_id_count
-- FROM public.invoices
-- WHERE workspace_id IS NULL
-- UNION ALL
-- SELECT 
--   'payments' AS table_name,
--   COUNT(*) AS null_workspace_id_count
-- FROM public.payments
-- WHERE workspace_id IS NULL
-- UNION ALL
-- SELECT 
--   'clients' AS table_name,
--   COUNT(*) AS null_workspace_id_count
-- FROM public.clients
-- WHERE workspace_id IS NULL
-- UNION ALL
-- SELECT 
--   'invoice_items' AS table_name,
--   COUNT(*) AS null_workspace_id_count
-- FROM public.invoice_items
-- WHERE workspace_id IS NULL;

-- 2) Verify invoices: no conflicts with clients.workspace_id
-- Expected: 0 rows (all invoices should match their client's workspace_id)
-- SELECT 
--   i.id,
--   i.invoice_number,
--   i.workspace_id AS invoice_workspace_id,
--   c.workspace_id AS client_workspace_id,
--   CASE WHEN i.workspace_id = c.workspace_id THEN 'MATCH' ELSE 'CONFLICT' END AS status
-- FROM public.invoices i
-- JOIN public.clients c ON c.id = i.client_id
-- WHERE i.workspace_id IS NOT NULL
--   AND c.workspace_id IS NOT NULL
--   AND i.workspace_id != c.workspace_id;

-- 3) Verify payments: no conflicts with invoices.workspace_id
-- Expected: 0 rows (all payments should match their invoice's workspace_id)
-- SELECT 
--   p.id,
--   p.invoice_id,
--   p.workspace_id AS payment_workspace_id,
--   i.workspace_id AS invoice_workspace_id,
--   CASE WHEN p.workspace_id = i.workspace_id THEN 'MATCH' ELSE 'CONFLICT' END AS status
-- FROM public.payments p
-- JOIN public.invoices i ON i.id = p.invoice_id
-- WHERE p.workspace_id IS NOT NULL
--   AND i.workspace_id IS NOT NULL
--   AND p.workspace_id != i.workspace_id;

-- 4) Verify payments: no conflicts with clients.workspace_id (when invoice missing)
-- Expected: 0 rows (payments without invoices should match their client's workspace_id)
-- SELECT 
--   p.id,
--   p.client_id,
--   p.workspace_id AS payment_workspace_id,
--   c.workspace_id AS client_workspace_id,
--   CASE WHEN p.workspace_id = c.workspace_id THEN 'MATCH' ELSE 'CONFLICT' END AS status
-- FROM public.payments p
-- JOIN public.clients c ON c.id = p.client_id
-- WHERE p.invoice_id IS NULL
--   AND p.workspace_id IS NOT NULL
--   AND c.workspace_id IS NOT NULL
--   AND p.workspace_id != c.workspace_id;

-- 5) Verify invoice_items: no conflicts with invoices.workspace_id
-- Expected: 0 rows (all invoice_items should match their invoice's workspace_id)
-- SELECT 
--   ii.id,
--   ii.invoice_id,
--   ii.workspace_id AS item_workspace_id,
--   i.workspace_id AS invoice_workspace_id,
--   CASE WHEN ii.workspace_id = i.workspace_id THEN 'MATCH' ELSE 'CONFLICT' END AS status
-- FROM public.invoice_items ii
-- JOIN public.invoices i ON i.id = ii.invoice_id
-- WHERE ii.workspace_id IS NOT NULL
--   AND i.workspace_id IS NOT NULL
--   AND ii.workspace_id != i.workspace_id;

-- 6) Verify clients: no conflicts with invoices.workspace_id
-- Expected: 0 rows (clients should match their invoices' workspace_id)
-- SELECT 
--   c.id,
--   c.name,
--   c.workspace_id AS client_workspace_id,
--   i.workspace_id AS invoice_workspace_id,
--   CASE WHEN c.workspace_id = i.workspace_id THEN 'MATCH' ELSE 'CONFLICT' END AS status
-- FROM public.clients c
-- JOIN public.invoices i ON i.client_id = c.id
-- WHERE c.workspace_id IS NOT NULL
--   AND i.workspace_id IS NOT NULL
--   AND c.workspace_id != i.workspace_id
-- GROUP BY c.id, c.name, c.workspace_id, i.workspace_id
-- LIMIT 20;

-- 7) Summary: Count of rows that could not be backfilled (still NULL)
-- SELECT 
--   'invoices' AS table_name,
--   COUNT(*) AS still_null_count,
--   CASE 
--     WHEN (SELECT COUNT(*) FROM public.invoices) > 0 
--     THEN COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.invoices)
--     ELSE 0
--   END AS percent_null
-- FROM public.invoices
-- WHERE workspace_id IS NULL
-- UNION ALL
-- SELECT 
--   'payments' AS table_name,
--   COUNT(*) AS still_null_count,
--   CASE 
--     WHEN (SELECT COUNT(*) FROM public.payments) > 0 
--     THEN COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.payments)
--     ELSE 0
--   END AS percent_null
-- FROM public.payments
-- WHERE workspace_id IS NULL
-- UNION ALL
-- SELECT 
--   'clients' AS table_name,
--   COUNT(*) AS still_null_count,
--   CASE 
--     WHEN (SELECT COUNT(*) FROM public.clients) > 0 
--     THEN COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.clients)
--     ELSE 0
--   END AS percent_null
-- FROM public.clients
-- WHERE workspace_id IS NULL;
