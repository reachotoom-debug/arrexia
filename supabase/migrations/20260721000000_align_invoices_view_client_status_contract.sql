-- ============================================================================
-- Align invoices_view with verified production contract (21 columns)
-- ============================================================================
--
-- Adds client status columns expected by application code and types/supabase.ts:
--   - client_is_active  (from clients.is_active)
--   - client_archived_at (from clients.archived_at)
--
-- Preserves all financial/status logic from 20260122000000 unchanged.
-- Column order matches verified production invoices_view.
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
    c.is_active AS client_is_active,
    c.archived_at AS client_archived_at,
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
  archived_at,
  client_is_active,
  client_archived_at
FROM invoice_status;

COMMENT ON VIEW public.invoices_view IS
'Canonical invoices view. Realtime derived values from base tables only. paid is SUM(active payments), outstanding = GREATEST(total - paid, 0). Excludes archived invoices and archived payments from all financial calculations. Exposes client_is_active and client_archived_at from clients join for dashboard, collections, and reminders filtering.';

SELECT pg_notify('pgrst', 'reload schema');
