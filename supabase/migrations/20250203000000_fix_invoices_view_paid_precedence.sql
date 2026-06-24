-- ============================================================================
-- Fix invoices_view to prefer calculated payments over stored total_paid
-- ============================================================================
-- 
-- Root cause: invoices_view uses COALESCE(i.total_paid, ip.paid_calculated, 0).
-- If invoices.total_paid is non-null (stale), it overrides the correct payments sum.
--
-- Fix: Reverse the order to prefer ip.paid_calculated first:
--   paid = COALESCE(ip.paid_calculated, i.total_paid, 0)
--
-- This ensures imported payments are immediately reflected in invoice totals.
-- ============================================================================

-- Drop dependent views first (must drop invoice_risk_view before invoices_view)
DROP VIEW IF EXISTS public.invoice_risk_view;
DROP VIEW IF EXISTS public.invoices_view;

CREATE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid from payments table (system-calculated)
  -- Only count payments with status 'completed', 'paid', or null
  -- ✅ CRITICAL: Exclude archived payments (p.archived_at IS NULL)
  -- Use net_amount if available, otherwise fallback to amount (handles imported payments with NULL net_amount)
  SELECT
    p.invoice_id,
    COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0) AS paid_calculated
  FROM public.payments p
  WHERE (
    p.status IS NULL 
    OR p.status = 'completed' 
    OR p.status = 'paid'
  )
  AND p.archived_at IS NULL  -- ✅ CRITICAL: Exclude archived payments
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
    i.amount AS total,  -- Alias: total = invoices.amount
    -- ✅ FIX: Prefer calculated payments sum over stored total_paid
    -- This ensures imported payments are immediately reflected
    COALESCE(ip.paid_calculated, i.total_paid, 0) AS paid,
    -- Outstanding uses the same paid value for consistency
    GREATEST(i.amount - COALESCE(ip.paid_calculated, i.total_paid, 0), 0) AS outstanding,
    i.currency AS currency,  -- ✅ CRITICAL: Explicitly from invoices table
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
  WHERE i.archived_at IS NULL  -- ✅ CRITICAL: Exclude archived invoices by default
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
  base_status,
  display_status,
  total,
  paid,
  outstanding,
  currency,
  po_number,
  notes,
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
  END AS risk_level
FROM invoice_status;

-- Reload PostgREST schema cache (important for Supabase API)
SELECT pg_notify('pgrst', 'reload schema');

-- Verification query: Check INV-0041 shows paid=879.96 outstanding=0 display_status='paid'
-- Run this after importing a payment of $479.96 to an invoice that already has $400 paid
-- Expected: paid=879.96, outstanding=0, display_status='paid'
SELECT 
  invoice_number,
  total,
  paid,
  outstanding,
  display_status
FROM public.invoices_view
WHERE invoice_number = 'INV-0041';

