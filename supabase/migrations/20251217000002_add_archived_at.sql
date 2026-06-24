-- ============================================================================
-- Add archived_at column to clients, invoices, payments for soft-delete
-- ============================================================================

-- Add archived_at to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add archived_at to invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add archived_at to payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add index for filtering archived records
CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON public.clients(archived_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_archived_at ON public.invoices(archived_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_archived_at ON public.payments(archived_at) WHERE archived_at IS NULL;

-- Update invoices_view to exclude archived invoices
DROP VIEW IF EXISTS public.invoices_view;

CREATE OR REPLACE VIEW public.invoices_view AS
WITH invoice_payments AS (
  SELECT
    p.invoice_id,
    COALESCE(SUM(p.amount), 0) AS paid
  FROM public.payments p
  INNER JOIN public.invoices i ON i.id = p.invoice_id
  WHERE (
    p.status IS NULL 
    OR p.status = 'completed' 
    OR p.status = 'paid'
  )
  AND p.archived_at IS NULL
  AND i.archived_at IS NULL
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
    i.status AS base_status,
    i.amount AS total,
    COALESCE(ip.paid, 0) AS paid,
    GREATEST(i.amount - COALESCE(ip.paid, 0), 0) AS outstanding,
    COALESCE(i.currency, 'USD') AS currency,
    c.name AS client_name,
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
  LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
  LEFT JOIN public.clients c ON c.id = i.client_id AND c.archived_at IS NULL
  WHERE i.archived_at IS NULL
),
invoice_status AS (
  SELECT
    *,
    CASE
      WHEN base_status = 'void' THEN 'void'
      WHEN base_status = 'draft' THEN 'draft'
      WHEN outstanding <= 0 THEN 'paid'
      WHEN base_status = 'sent'
           AND outstanding > 0
           AND due_date < CURRENT_DATE THEN 'overdue'
      WHEN base_status = 'sent'
           AND outstanding > 0
           AND due_date >= CURRENT_DATE THEN
        CASE
          WHEN paid > 0 THEN 'partially_paid'
          ELSE 'sent'
        END
      ELSE base_status
    END AS display_status,
    CASE
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date < CURRENT_DATE THEN true
      ELSE false
    END AS is_overdue,
    CASE
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date < CURRENT_DATE THEN
        CASE
          WHEN overdue_days > 90 THEN 'high'
          WHEN overdue_days > 30 THEN 'medium'
          ELSE 'low'
        END
      ELSE NULL
    END AS risk_level
  FROM invoice_calculations
)
SELECT
  id,
  workspace_id,
  client_id,
  client_name,
  invoice_number,
  base_status,
  issue_date,
  due_date,
  currency,
  total,
  paid,
  outstanding,
  display_status,
  is_overdue,
  overdue_days,
  risk_level,
  NULL::text AS po_number,
  NULL::text AS notes
FROM invoice_status;

-- Update payments_view to exclude archived payments and invoices
DROP VIEW IF EXISTS public.payments_view;

CREATE OR REPLACE VIEW public.payments_view AS
SELECT
  p.id,
  p.workspace_id,
  p.invoice_id,
  COALESCE(p.payment_date, p.created_at::date) AS payment_date,
  p.amount,
  COALESCE(p.currency, i.currency, s.default_currency, 'USD') AS currency,
  p.method,
  p.status,
  p.transaction_id,
  p.notes,
  p.payment_provider,
  p.created_at,
  p.updated_at,
  i.invoice_number AS invoice_number,
  c.name AS client_name,
  (p.status = 'failed') AS is_failed,
  p.payment_date AS paid_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.id = p.invoice_id AND i.archived_at IS NULL
LEFT JOIN public.clients c ON c.id = i.client_id AND c.archived_at IS NULL
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id
WHERE p.archived_at IS NULL;

COMMENT ON VIEW public.invoices_view IS 
'Invoices view excluding archived records. Use archived_at IS NULL filter in base queries.';

COMMENT ON VIEW public.payments_view IS 
'Payments view excluding archived records. Use archived_at IS NULL filter in base queries.';
