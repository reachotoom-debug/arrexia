-- ============================================================================
-- Fix invoice/payment realtime consistency and archived filtering
-- ============================================================================
--
-- Goals:
-- 1) invoices_view must always recalculate from base tables after payment changes
-- 2) paid/outstanding must use active payments only (archived_at IS NULL)
-- 3) outstanding must be total - SUM(payments)
-- 4) joins must be workspace-safe and grouped by invoice_id
-- 5) payments_view must be active-only to match app contract
--
-- Notes:
-- - Uses regular views (not materialized), so recalculation is immediate on read.
-- - Adds workspace_id to payment aggregation join for stronger data isolation.
--
-- ============================================================================

CREATE OR REPLACE VIEW public.invoices_view AS
WITH invoice_payments AS (
  SELECT
    p.workspace_id,
    p.invoice_id,
    COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0) AS paid
  FROM public.payments p
  WHERE
    p.archived_at IS NULL
    AND p.invoice_id IS NOT NULL
    AND (
      p.status IS NULL
      OR p.status = 'completed'
      OR p.status = 'paid'
    )
  GROUP BY p.workspace_id, p.invoice_id
),
invoice_calculations AS (
  SELECT
    i.id,
    i.workspace_id,
    i.client_id,
    i.invoice_number,
    i.issue_date,
    i.due_date,
    i.status AS base_status,
    i.amount AS total,
    COALESCE(ip.paid, 0) AS paid,
    GREATEST(i.amount - COALESCE(ip.paid, 0), 0) AS outstanding,
    i.currency AS currency,
    i.po_number AS po_number,
    i.notes AS notes,
    i.archived_at AS archived_at,
    c.name AS client_name,
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
  LEFT JOIN invoice_payments ip
    ON ip.invoice_id = i.id
   AND ip.workspace_id = i.workspace_id
  LEFT JOIN public.clients c
    ON c.id = i.client_id
  WHERE i.archived_at IS NULL
),
invoice_status AS (
  SELECT
    *,
    CASE
      WHEN base_status = 'void' THEN 'void'
      WHEN base_status = 'draft' THEN 'draft'
      WHEN outstanding <= 0 THEN 'paid'
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date < CURRENT_DATE THEN 'overdue'
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date >= CURRENT_DATE THEN
        CASE
          WHEN paid > 0 AND outstanding > 0 THEN 'partially_paid'
          ELSE 'sent'
        END
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
    WHEN display_status <> 'overdue' THEN NULL
    WHEN overdue_days >= 60 OR outstanding >= 5000 THEN 'high'
    WHEN overdue_days BETWEEN 15 AND 59 THEN 'medium'
    WHEN overdue_days BETWEEN 1 AND 14 THEN 'low'
    ELSE NULL
  END AS risk_level,
  po_number,
  notes,
  archived_at
FROM invoice_status;

CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  p.id,
  p.workspace_id,
  p.invoice_id,
  p.client_id,
  p.amount,
  COALESCE(p.currency, i.currency, s.default_currency, 'USD') AS currency,
  p.transaction_fee,
  p.net_amount,
  p.payment_date,
  p.method,
  p.status,
  p.transaction_id,
  p.proof_url,
  p.notes,
  p.payment_provider,
  p.created_at,
  p.updated_at,
  p.archived_at,
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  COALESCE(p.payment_date::timestamptz, p.created_at) AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i
  ON i.id = p.invoice_id
LEFT JOIN public.clients c
  ON c.id = COALESCE(p.client_id, i.client_id)
LEFT JOIN public.settings s
  ON s.workspace_id = p.workspace_id
WHERE p.archived_at IS NULL;

COMMENT ON VIEW public.invoices_view IS
'Canonical invoices view. Realtime derived values from base tables only. paid is SUM(active payments), outstanding = GREATEST(total - paid, 0). Excludes archived invoices and archived payments from all financial calculations.';

COMMENT ON VIEW public.payments_view IS
'Active payments only (archived_at IS NULL). Includes invoice/client metadata and paid_at for consistent sorting.';

SELECT pg_notify('pgrst', 'reload schema');
