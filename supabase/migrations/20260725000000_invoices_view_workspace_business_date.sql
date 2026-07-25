-- ============================================================================
-- R2I: Workspace-aware invoice aging/status in invoices_view
-- ============================================================================
--
-- Replaces PostgreSQL session calendar date with each
-- workspace's configured IANA timezone from public.settings.timezone.
--
-- Preserves the verified 21-column invoices_view contract and all status/risk
-- semantics from 20260721000000 — only the "today" reference is workspace-local.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.workspace_business_date(
  p_timezone text,
  p_reference timestamptz DEFAULT statement_timestamp()
)
RETURNS date
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  tz text;
BEGIN
  tz := NULLIF(btrim(COALESCE(p_timezone, '')), '');
  IF tz IS NULL THEN
    tz := 'UTC';
  END IF;

  BEGIN
    RETURN (p_reference AT TIME ZONE tz)::date;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      RETURN (p_reference AT TIME ZONE 'UTC')::date;
  END;
END;
$$;

COMMENT ON FUNCTION public.workspace_business_date(text, timestamptz) IS
  'Maps a timestamptz to workspace-local calendar date (settings.timezone). Null/empty/invalid timezone falls back to UTC. Used by invoices_view aging.';

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
invoice_base AS (
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
    public.workspace_business_date(s.timezone) AS workspace_today
  FROM public.invoices i
  LEFT JOIN invoice_payments ip
    ON ip.invoice_id = i.id
   AND ip.workspace_id = i.workspace_id
  LEFT JOIN public.clients c
    ON c.id = i.client_id
  LEFT JOIN public.settings s
    ON s.workspace_id = i.workspace_id
  WHERE i.archived_at IS NULL
),
invoice_calculations AS (
  SELECT
    *,
    CASE
      WHEN due_date IS NULL THEN 0
      WHEN due_date < workspace_today THEN GREATEST(0, (workspace_today - due_date))
      ELSE 0
    END AS overdue_days
  FROM invoice_base
),
invoice_status AS (
  SELECT
    *,
    CASE
      WHEN base_status = 'void' THEN 'void'
      WHEN base_status = 'draft' THEN 'draft'
      WHEN outstanding <= 0 THEN 'paid'
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date < workspace_today THEN 'overdue'
      WHEN base_status = 'sent' AND outstanding > 0 AND due_date >= workspace_today THEN
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
'Canonical invoices view. Realtime derived values from base tables only. Aging/status uses workspace_business_date(settings.timezone). paid is SUM(active payments), outstanding = GREATEST(total - paid, 0). Excludes archived invoices and archived payments from all financial calculations. Exposes client_is_active and client_archived_at from clients join for dashboard, collections, and reminders filtering.';

SELECT pg_notify('pgrst', 'reload schema');
