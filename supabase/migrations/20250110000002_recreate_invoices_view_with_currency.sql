-- ============================================================================
-- Recreate invoices_view with all required columns including currency
-- ============================================================================
-- 
-- This migration drops and recreates invoices_view to include:
-- - id, workspace_id, client_id, invoice_number, issue_date, due_date
-- - base_status, display_status, total_amount, paid_amount, outstanding
-- - overdue, overdue_days, risk_level, client_name, currency
--
-- Rules:
-- - base_status: from invoices.status, only draft|sent|void
-- - display_status: computed (paid/partially_paid/overdue/sent/draft/void)
-- - currency: from invoices.currency (fallback to 'USD' if null)
-- - paid_amount: sum of eligible payments (status 'completed' or 'paid' or null)
-- - outstanding: max(total_amount - paid_amount, 0)
-- ============================================================================

DROP VIEW IF EXISTS public.invoices_view;

CREATE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid_amount from payments table
  -- Only count payments with status 'completed', 'paid', or null
  SELECT
    p.invoice_id,
    COALESCE(SUM(p.amount), 0) AS paid_amount
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
    i.amount AS total_amount,
    COALESCE(ip.paid_amount, 0) AS paid_amount,  -- Sum of eligible payments
    GREATEST(i.amount - COALESCE(ip.paid_amount, 0), 0) AS outstanding,  -- max(total - paid, 0)
    COALESCE(i.currency, 'USD') AS currency,  -- From invoices.currency, fallback to USD
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
          WHEN paid_amount > 0 THEN 'partially_paid'
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
  invoice_number,
  issue_date,
  due_date,
  base_status,
  display_status,
  total_amount,
  paid_amount,
  outstanding,
  (display_status = 'overdue') AS overdue,
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
  client_name,
  currency
FROM invoice_status;

-- Add comment to document the view
COMMENT ON VIEW public.invoices_view IS 
  'Comprehensive view for invoice status, overdue, and risk calculations. Includes currency from invoices table. Draft invoices are NEVER treated as overdue or risk, even if due_date is in the past. Display status: void (highest priority), draft (protected from overdue), paid (outstanding <= 0), overdue (sent + outstanding > 0 + due_date < current_date), partially_paid (sent + outstanding > 0 + due_date >= current_date + paid_amount > 0), sent (sent + outstanding > 0 + due_date >= current_date + paid_amount = 0). Risk levels: high (overdue_days >= 60 OR outstanding >= 5000), medium (overdue_days 15-59), low (overdue_days 1-14), NULL (not overdue). Paid amount is sum of payments with status completed/paid/null.';

