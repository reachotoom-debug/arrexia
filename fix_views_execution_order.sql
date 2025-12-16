-- ============================================================================
-- Fix view execution order: Ensure invoices_view exists before invoice_risk_view
-- This script drops both views, recreates invoices_view first, then invoice_risk_view
-- ============================================================================

-- Step 1: Drop views in correct order (invoice_risk_view first, then invoices_view)
DROP VIEW IF EXISTS public.invoice_risk_view;
DROP VIEW IF EXISTS public.invoices_view;

-- Step 2: Create invoices_view with all required columns
-- Currency logic: coalesce(i.currency, c.currency, s.default_currency, 'USD')
-- Note: settings table uses default_currency (NOT currency)
CREATE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid from payments table
  -- Only count payments with status 'completed', 'paid', or null
  SELECT
    p.invoice_id,
    COALESCE(SUM(p.amount), 0) AS paid
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
    -- Currency: coalesce(i.currency, c.currency, s.default_currency, 'USD')
    -- Note: settings table uses default_currency (NOT currency)
    COALESCE(i.currency, c.currency, s.default_currency, 'USD') AS currency,
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
  LEFT JOIN public.settings s ON s.workspace_id = i.workspace_id
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

-- Step 3: Create invoice_risk_view after invoices_view exists
CREATE VIEW public.invoice_risk_view AS
WITH base AS (
  SELECT
    i.id AS invoice_id,
    i.workspace_id,
    i.status,
    i.due_date,
    i.issue_date,
    i.amount AS total_amount,
    COALESCE(i.total_paid, 0) AS amount_paid,
    COALESCE(i.outstanding_amount, 0) AS outstanding_amount,
    -- Calculate overdue_days: 0 if not overdue, positive number if overdue
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
)
SELECT
  b.invoice_id,
  b.workspace_id,
  b.status,
  b.due_date,
  b.issue_date,
  b.total_amount,
  b.amount_paid,
  b.outstanding_amount,
  b.overdue_days,
  (b.overdue_days > 0 AND b.outstanding_amount > 0) AS is_overdue,
  CASE
    WHEN b.outstanding_amount <= 0 OR b.overdue_days <= 0 THEN NULL
    WHEN b.outstanding_amount >= 3000 OR b.overdue_days >= 30 THEN 'high'
    WHEN b.outstanding_amount >= 1500 OR b.overdue_days >= 14 THEN 'medium'
    ELSE 'low'
  END AS risk_level
FROM base b;

-- Step 4: Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- Step 5: Verification query - List all columns in invoices_view
SELECT 
  column_name,
  data_type,
  is_nullable,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invoices_view'
ORDER BY ordinal_position;
