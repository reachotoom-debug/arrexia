-- ============================================================================
-- Fix invoices_view to enforce canonical contract with required columns
-- This migration ensures the view has a stable, documented contract that all
-- queries can rely on.
-- ============================================================================

-- Step 1: Drop existing view
DROP VIEW IF EXISTS public.invoices_view;

-- Step 2: Create view with canonical contract
-- Required columns:
--   id, workspace_id, client_id, client_name, invoice_number
--   issue_date, due_date, currency (nullable)
--   total, paid, outstanding
--   base_status (Draft/Sent/Void only)
--   display_status (Paid/Partially Paid/Overdue derived)
--   is_overdue boolean (derived from due_date + outstanding)
-- Optional: po_number, notes
CREATE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid from payments table
  -- Only count payments with status 'completed', 'paid', or null
  -- Use net_amount if available, otherwise fallback to amount (handles imported payments with NULL net_amount)
  SELECT
    p.invoice_id,
    COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0) AS paid
  FROM public.payments p
  WHERE (
    p.status IS NULL 
    OR p.status = 'completed' 
    OR p.status = 'paid'
  )
  GROUP BY p.invoice_id
),
invoice_calculations AS (
  SELECT
    i.id,
    i.workspace_id,
    i.client_id,
    i.invoice_number,
    i.issue_date,
    i.due_date,
    i.status AS base_status,  -- Only draft|sent|void from invoices.status
    i.amount AS total,
    COALESCE(ip.paid, 0) AS paid,  -- Sum of eligible payments
    GREATEST(i.amount - COALESCE(ip.paid, 0), 0) AS outstanding,  -- max(total - paid, 0)
    i.currency AS currency,  -- Explicitly from invoices table
    i.po_number AS po_number,  -- Optional field
    i.notes AS notes,  -- Optional field
    c.name AS client_name,
    -- Calculate overdue_days: 0 if not overdue, positive number if overdue
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
  LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
  LEFT JOIN public.clients c ON c.id = i.client_id
),
invoice_status AS (
  SELECT
    *,
    -- Calculate display_status with draft protection
    CASE
      -- 1) Void wins (highest priority)
      WHEN base_status = 'void' THEN 'void'
      -- 2) Draft protection: drafts are never overdue
      WHEN base_status = 'draft' THEN 'draft'
      -- 3) Fully paid (not void/draft)
      WHEN outstanding <= 0 THEN 'paid'
      -- 4) Sent + outstanding > 0 + past due date = overdue
      WHEN base_status = 'sent' 
           AND outstanding > 0 
           AND due_date < CURRENT_DATE THEN 'overdue'
      -- 5) Sent + outstanding > 0 + not past due date
      WHEN base_status = 'sent' 
           AND outstanding > 0 
           AND due_date >= CURRENT_DATE THEN
        CASE
          WHEN paid > 0 THEN 'partially_paid'
          ELSE 'sent'
        END
      -- Fallback (shouldn't happen, but safe)
      ELSE base_status
    END AS display_status
  FROM invoice_calculations
)
SELECT
  id,
  workspace_id,
  client_id,
  client_name,
  invoice_number,
  issue_date,
  due_date,
  currency,
  total,
  paid,
  outstanding,
  base_status,
  display_status,
  (display_status = 'overdue') AS is_overdue,
  overdue_days,
  CASE
    -- Only calculate risk for overdue invoices (display_status = 'overdue')
    WHEN display_status <> 'overdue' THEN NULL
    -- Calculate risk based on overdue_days and outstanding amount
    WHEN overdue_days >= 60 OR outstanding >= 5000 THEN 'high'
    WHEN overdue_days BETWEEN 15 AND 59 THEN 'medium'
    WHEN overdue_days BETWEEN 1 AND 14 THEN 'low'
    ELSE NULL
  END AS risk_level,
  po_number,
  notes
FROM invoice_status;

-- Step 3: Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- Step 4: Verify columns exist
DO $$
DECLARE
  expected_columns TEXT[] := ARRAY[
    'id', 'workspace_id', 'client_id', 'client_name', 'invoice_number',
    'issue_date', 'due_date', 'currency', 'total', 'paid', 'outstanding',
    'base_status', 'display_status', 'is_overdue', 'overdue_days', 'risk_level',
    'po_number', 'notes'
  ];
  actual_columns TEXT[];
  missing_columns TEXT[];
BEGIN
  -- Get actual columns
  SELECT ARRAY_AGG(column_name ORDER BY ordinal_position)
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'invoices_view';
  
  -- Find missing columns
  SELECT ARRAY_AGG(col)
  INTO missing_columns
  FROM UNNEST(expected_columns) AS col
  WHERE col NOT IN (SELECT UNNEST(actual_columns));
  
  IF missing_columns IS NOT NULL AND array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Missing columns in invoices_view: %', array_to_string(missing_columns, ', ');
  END IF;
  
  RAISE NOTICE 'invoices_view contract verified: all required columns exist';
END $$;

-- Step 5: Test query to ensure currency is accessible
SELECT id, currency, total, paid, outstanding
FROM public.invoices_view 
LIMIT 5;

-- Add comment to document the view contract
COMMENT ON VIEW public.invoices_view IS 
  'Canonical invoices view with stable contract. Required columns: id, workspace_id, client_id, client_name, invoice_number, issue_date, due_date, currency (nullable), total, paid, outstanding, base_status (draft/sent/void), display_status (paid/partially_paid/overdue/sent/draft/void), is_overdue (boolean), overdue_days, risk_level (high/medium/low/null), po_number (optional), notes (optional). Draft invoices are NEVER treated as overdue or risk, even if due_date is in the past. Display status: void (highest priority), draft (protected from overdue), paid (outstanding <= 0), overdue (sent + outstanding > 0 + due_date < current_date), partially_paid (sent + outstanding > 0 + due_date >= current_date + paid > 0), sent (sent + outstanding > 0 + due_date >= current_date + paid = 0). Risk levels: high (overdue_days >= 60 OR outstanding >= 5000), medium (overdue_days 15-59), low (overdue_days 1-14), NULL (not overdue). Paid amount is sum of payments with status completed/paid/null.';

