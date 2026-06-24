-- ============================================================================
-- Exclude archived invoices from invoices_view
-- ============================================================================
-- 
-- This migration adds a WHERE clause to invoices_view to exclude archived
-- invoices by default. This ensures archived invoices never appear in
-- All/Sent/Paid/Partial/Overdue/Void tabs.
--
-- The view will only include invoices where archived_at IS NULL.
-- ============================================================================

-- Drop dependent views first (must drop invoice_risk_view before invoices_view)
DROP VIEW IF EXISTS public.invoice_risk_view;
DROP VIEW IF EXISTS public.invoices_view;

CREATE OR REPLACE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid from payments table (system-calculated)
  -- Only count payments with status 'completed', 'paid', or null
  -- ✅ CRITICAL: Exclude archived payments (archived_at IS NULL)
  SELECT
    p.invoice_id,
    COALESCE(SUM(p.amount), 0) AS paid_calculated
  FROM public.payments p
  WHERE (
    p.status IS NULL 
    OR p.status = 'completed' 
    OR p.status = 'paid'
  )
  AND p.archived_at IS NULL  -- ✅ Exclude archived payments
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
    -- Use invoices.total_paid if available, otherwise calculate from payments
    -- This ensures consistency: paid = invoices.total_paid (system-calculated and stored)
    COALESCE(i.total_paid, COALESCE(ip.paid_calculated, 0), 0) AS paid,  -- Alias: paid = invoices.total_paid
    GREATEST(i.amount - COALESCE(i.total_paid, COALESCE(ip.paid_calculated, 0), 0), 0) AS outstanding,  -- max(total - paid, 0)
    i.currency AS currency,  -- ✅ CRITICAL: Explicitly from invoices table
    i.po_number AS po_number,  -- Optional field
    i.notes AS notes,  -- Optional field
    i.archived_at AS archived_at,  -- ✅ Include archived_at (will always be NULL due to WHERE clause, but allows defensive filtering)
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
  WHERE i.archived_at IS NULL  -- ✅ Exclude archived invoices by default
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
  currency,  -- ✅ CRITICAL: Currency must be in final SELECT
  total,
  paid,
  outstanding,
  base_status,
  display_status,
  (display_status = 'overdue') AS is_overdue,  -- Alias: is_overdue = display_status = 'overdue'
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
  notes,
  archived_at  -- ✅ Include archived_at (always NULL, but allows defensive filtering in application code)
FROM invoice_status;

-- Reload PostgREST schema cache (important for Supabase API)
SELECT pg_notify('pgrst', 'reload schema');

-- Add comment to document the view contract
COMMENT ON VIEW public.invoices_view IS 
  'Canonical invoices view with stable contract. Required columns: id, workspace_id, client_id, client_name, invoice_number, issue_date, due_date, currency (nullable), total, paid, outstanding, base_status (draft/sent/void), display_status (paid/partially_paid/overdue/sent/draft/void), is_overdue (boolean), overdue_days, risk_level (high/medium/low/null), po_number (optional), notes (optional), archived_at (always NULL, included for defensive filtering). Only includes non-archived invoices (WHERE i.archived_at IS NULL). Paid amount excludes archived payments (p.archived_at IS NULL). Draft invoices are NEVER treated as overdue or risk, even if due_date is in the past. Display status: void (highest priority), draft (protected from overdue), paid (outstanding <= 0), overdue (sent + outstanding > 0 + due_date < current_date), partially_paid (sent + outstanding > 0 + due_date >= current_date + paid > 0), sent (sent + outstanding > 0 + due_date >= current_date + paid = 0). Risk levels: high (overdue_days >= 60 OR outstanding >= 5000), medium (overdue_days 15-59), low (overdue_days 1-14), NULL (not overdue).';

