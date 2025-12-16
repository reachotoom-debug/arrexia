-- Create invoice_risk_view: single source of truth for invoice risk classification
-- Risk levels match the logic in lib/invoices/risk.ts:
--   - High: outstanding_amount >= 3000 OR days_overdue >= 30
--   - Medium: outstanding_amount >= 1500 OR days_overdue >= 14
--   - Low: overdue but below medium thresholds
--   - NULL: not overdue or outstanding_amount <= 0

DROP VIEW IF EXISTS public.invoice_risk_view;

CREATE OR REPLACE VIEW public.invoice_risk_view AS
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
    END AS overdue_days,

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
  b.days_overdue,
  (b.days_overdue > 0 AND b.outstanding_amount > 0) AS is_overdue,
  CASE
    WHEN b.outstanding_amount <= 0 OR b.days_overdue <= 0 THEN NULL
    WHEN b.outstanding_amount >= 3000 OR b.days_overdue >= 30 THEN 'high'
    WHEN b.outstanding_amount >= 1500 OR b.days_overdue >= 14 THEN 'medium'
    ELSE 'low'
  END AS risk_level
FROM base b;
