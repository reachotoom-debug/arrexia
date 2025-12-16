-- Update invoices_view: enforce single consistent invoice status and risk model
-- Core rule: Draft invoices are NEVER treated as overdue or risky, even if due_date is in the past
--
-- This view replaces the previous invoices_view with standardized status values and column names
-- Status values: 'Void', 'Paid', 'Partially Paid', 'Draft', 'Overdue', 'Sent'

DROP VIEW IF EXISTS invoices_view;

CREATE VIEW invoices_view AS
WITH invoice_base AS (
  SELECT
    i.id,
    i.workspace_id,
    i.client_id,
    i.invoice_number,
    i.issue_date,
    i.due_date,
    i.status AS manual_status,  -- 'draft' | 'sent' | 'void'
    i.amount AS total_amount,
    COALESCE(i.total_paid, 0) AS total_paid,
    (i.amount - COALESCE(i.total_paid, 0)) AS outstanding_amount
  FROM invoices i
),
invoice_status AS (
  SELECT
    *,
    -- Derived final status with draft protection
    CASE
      WHEN manual_status = 'void' THEN 'Void'
      WHEN total_amount > 0 AND total_paid >= total_amount THEN 'Paid'
      WHEN total_paid > 0 AND total_paid < total_amount THEN 'Partially Paid'
      WHEN manual_status = 'draft' THEN 'Draft'
      WHEN manual_status = 'sent'
           AND due_date < CURRENT_DATE
           AND outstanding_amount > 0
        THEN 'Overdue'
      ELSE 'Sent'
    END AS status
  FROM invoice_base
)
SELECT
  id,
  workspace_id,
  client_id,
  invoice_number,
  issue_date,
  due_date,
  manual_status,
  total_amount,
  total_paid,
  outstanding_amount,
  status,
  -- is_overdue: only true if status = 'Overdue'
  (status = 'Overdue') AS is_overdue,
  -- days_overdue: only calculated for overdue invoices
  CASE
    WHEN status = 'Overdue' THEN GREATEST((CURRENT_DATE - due_date)::integer, 0)
    ELSE 0
  END AS days_overdue,
  -- risk_level: only for overdue invoices
  CASE
    WHEN status = 'Overdue'
         AND (GREATEST((CURRENT_DATE - due_date)::integer, 0) >= 30
              OR outstanding_amount >= 5000)
      THEN 'high'
    WHEN status = 'Overdue'
         AND GREATEST((CURRENT_DATE - due_date)::integer, 0) BETWEEN 8 AND 29
      THEN 'medium'
    WHEN status = 'Overdue'
         AND GREATEST((CURRENT_DATE - due_date)::integer, 0) BETWEEN 1 AND 7
      THEN 'low'
    ELSE NULL
  END AS risk_level
FROM invoice_status;

-- Add comment to document the view
COMMENT ON VIEW invoices_view IS 
  'Single source of truth for invoice status and risk calculations. Draft invoices are NEVER treated as overdue or risky, even if due_date is in the past. Status values: Void (highest priority), Paid (outstanding <= 0), Partially Paid (some payment but not full), Draft (protected from overdue), Overdue (sent + outstanding > 0 + due_date < current_date), Sent (sent + outstanding > 0 + due_date >= current_date). Risk levels: high (days_overdue >= 30 OR outstanding >= 5000), medium (days_overdue 8-29), low (days_overdue 1-7), NULL (not overdue).';

