-- 20250105000000_update_invoices_view_with_client.sql

CREATE OR REPLACE VIEW public.invoices_view AS
WITH invoice_calculations AS (
  SELECT
    i.id,
    i.workspace_id,
    i.client_id,
    i.invoice_number,
    c.name AS client_name,
    i.status AS base_status,              -- 'draft' | 'sent' | 'void'
    i.amount AS total_amount,
    COALESCE(i.total_paid, 0) AS paid_amount,
    (i.amount - COALESCE(i.total_paid, 0)) AS outstanding,
    i.issue_date,
    i.due_date,
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
  LEFT JOIN public.clients c
    ON c.id = i.client_id
),
invoice_status AS (
  SELECT
    *,
    -- display_status with draft + void protection
    CASE
      WHEN base_status = 'void' THEN 'void'
      WHEN base_status = 'draft' THEN 'draft'              -- never overdue
      WHEN outstanding <= 0 THEN 'paid'                    -- fully paid
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
      ELSE base_status
    END AS display_status
  FROM invoice_calculations
)
SELECT
  -- ⚠️ first 12 columns: keep EXACTLY same names & order
  id,
  workspace_id,
  base_status,
  total_amount,
  paid_amount,
  outstanding,
  due_date,
  issue_date,
  overdue_days,
  display_status,
  (display_status = 'overdue') AS overdue,
  CASE
    WHEN display_status <> 'overdue' THEN NULL
    WHEN overdue_days >= 60 OR outstanding >= 5000 THEN 'high'
    WHEN overdue_days BETWEEN 15 AND 59 THEN 'medium'
    WHEN overdue_days BETWEEN 1 AND 14 THEN 'low'
    ELSE NULL
  END AS risk_level,
  -- ✅ new columns added AFTER the existing ones (this is allowed)
  client_id,
  client_name,
  invoice_number
FROM invoice_status;
