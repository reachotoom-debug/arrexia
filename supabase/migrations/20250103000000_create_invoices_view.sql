-- Create invoices_view: comprehensive view for invoice status, overdue, and risk calculations
-- This view ensures draft invoices are NEVER treated as overdue or risk, even if due_date is in the past
-- 
-- Inputs:
--   - base_status (from invoices.status): 'draft' | 'sent' | 'void'
--   - total_amount (from invoices.amount)
--   - paid_amount (from invoices.total_paid)
--   - due_date
--   - current_date for overdue detection
--
-- Derived:
--   - outstanding = total_amount - paid_amount
--   - overdue_days = GREATEST(0, current_date - due_date)
--   - display_status: 'void' | 'draft' | 'paid' | 'overdue' | 'partially_paid' | 'sent'
--   - overdue: boolean (true only if display_status = 'overdue')
--   - risk_level: 'high' | 'medium' | 'low' | NULL (only for overdue invoices, ignores drafts)

DROP VIEW IF EXISTS public.invoices_view;

CREATE VIEW public.invoices_view AS
WITH invoice_calculations AS (
  SELECT
    i.id AS invoice_id,
    i.workspace_id,
    i.status AS base_status,
    i.amount AS total_amount,
    COALESCE(i.total_paid, 0) AS paid_amount,
    (i.amount - COALESCE(i.total_paid, 0)) AS outstanding,
    i.due_date,
    i.issue_date,
    -- Calculate overdue_days: 0 if not overdue, positive number if overdue
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM invoices i
),
invoice_status AS (
  SELECT
    *,
    -- Calculate display_status with draft protection
    CASE
      -- 1) Void wins
      WHEN base_status = 'void' THEN 'void'
      -- 2) Draft protection: drafts are never overdue
      WHEN base_status = 'draft' THEN 'draft'
      -- 3) Fully paid (not void/draft)
      WHEN outstanding <= 0 THEN 'paid'
      -- 4) Sent + outstanding > 0
      WHEN base_status = 'sent' 
           AND outstanding > 0 
           AND due_date < CURRENT_DATE THEN 'overdue'
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
  invoice_id AS id,
  workspace_id,
  base_status,
  total_amount,
  paid_amount,
  outstanding,
  due_date,
  issue_date,
  overdue_days,
  display_status,
  -- Overdue boolean: true only if display_status = 'overdue'
  (display_status = 'overdue') AS overdue,
  -- Risk level: only calculated for overdue invoices, ignores drafts
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

-- Add comment to document the view
COMMENT ON VIEW invoices_view IS 
  'Comprehensive view for invoice status, overdue, and risk calculations. Draft invoices are NEVER treated as overdue or risk, even if due_date is in the past. Display status: void (highest priority), draft (protected from overdue), paid (outstanding <= 0), overdue (sent + outstanding > 0 + due_date < current_date), partially_paid (sent + outstanding > 0 + due_date >= current_date + paid_amount > 0), sent (sent + outstanding > 0 + due_date >= current_date + paid_amount = 0). Risk levels: high (overdue_days >= 60 OR outstanding >= 5000), medium (overdue_days 15-59), low (overdue_days 1-14), NULL (not overdue).';

