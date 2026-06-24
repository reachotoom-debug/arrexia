-- ============================================================================
-- Contract Lock: Lock all views to prevent drift
-- ============================================================================
-- 
-- This migration ensures all views (payments_view, invoices_view, invoice_risk_view)
-- are recreated with their canonical, final definitions. This prevents drift
-- from accidental modifications or inconsistent migrations.
-- 
-- Order of operations:
-- 1. Drop dependent views first (invoice_risk_view, payment_eligible_clients depend on invoices_view)
-- 2. Drop invoices_view and payments_view
-- 3. Recreate invoices_view (base view)
-- 4. Recreate payments_view (can depend on invoices)
-- 5. Recreate invoice_risk_view (depends on invoices_view)
-- 6. Recreate payment_eligible_clients (depends on invoices_view)
-- ============================================================================

DO $$
BEGIN
  -- Check if base tables exist
  IF to_regclass('public.payments') IS NULL THEN
    RAISE NOTICE 'Skipping contract lock views migration: table public.payments does not exist.';
    RETURN;
  END IF;

  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE 'Skipping contract lock views migration: table public.invoices does not exist.';
    RETURN;
  END IF;

  IF to_regclass('public.clients') IS NULL THEN
    RAISE NOTICE 'Skipping contract lock views migration: table public.clients does not exist.';
    RETURN;
  END IF;

  -- Step 1: Drop dependent views first
  EXECUTE 'DROP VIEW IF EXISTS public.invoice_risk_view CASCADE';
  EXECUTE 'DROP VIEW IF EXISTS public.payment_eligible_clients CASCADE';
  EXECUTE 'DROP VIEW IF EXISTS public.invoices_view CASCADE';
  EXECUTE 'DROP VIEW IF EXISTS public.payments_view CASCADE';

  -- Step 2: Recreate invoices_view (base view, no dependencies on other views)
  EXECUTE $sql$
CREATE VIEW public.invoices_view AS
WITH invoice_payments AS (
  -- Calculate paid from payments table ONLY (no fallback to invoices.total_paid)
  -- Only count payments with status 'completed', 'paid', or null
  -- CRITICAL: Exclude archived payments (p.archived_at IS NULL)
  -- Use net_amount if available, otherwise fallback to amount (handles imported payments with NULL net_amount)
  SELECT
    p.invoice_id,
    COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0) AS paid
  FROM public.payments p
  WHERE (
    p.archived_at IS NULL
    AND (
      p.status IS NULL 
      OR p.status = 'completed' 
      OR p.status = 'paid'
    )
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
    i.status AS base_status,
    i.amount AS total,
    COALESCE(ip.paid, 0) AS paid,
    GREATEST(i.amount - COALESCE(ip.paid, 0), 0) AS outstanding,
    i.currency AS currency,
    i.po_number AS po_number,
    i.notes AS notes,
    c.name AS client_name,
    CASE
      WHEN i.due_date IS NULL THEN 0
      WHEN i.due_date < CURRENT_DATE THEN
        GREATEST(0, (CURRENT_DATE - i.due_date))
      ELSE 0
    END AS overdue_days
  FROM public.invoices i
  LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
  LEFT JOIN public.clients c ON c.id = i.client_id
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
  notes
FROM invoice_status;
  $sql$;

  -- Step 3: Recreate payments_view (can depend on invoices_view)
  EXECUTE $sql$
CREATE VIEW public.payments_view AS
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
LEFT JOIN public.invoices i ON i.id = p.invoice_id
LEFT JOIN public.clients c ON c.id = COALESCE(p.client_id, i.client_id)
LEFT JOIN public.settings s ON s.workspace_id = p.workspace_id;
  $sql$;

  -- Step 4: Recreate invoice_risk_view (depends on invoices_view)
  IF to_regclass('public.invoices_view') IS NULL THEN
    RAISE NOTICE 'Skipping invoice_risk_view: base view public.invoices_view does not exist.';
  ELSE
    EXECUTE $sql$
CREATE VIEW public.invoice_risk_view AS
SELECT
  workspace_id,
  id AS invoice_id,
  client_id,
  client_name,
  invoice_number,
  issue_date,
  due_date,
  currency,
  total,
  paid,
  outstanding,
  overdue_days,
  risk_level,
  display_status
FROM public.invoices_view
WHERE display_status = 'overdue'
  AND outstanding > 0
  AND workspace_id IS NOT NULL;
    $sql$;
  END IF;

  -- Step 5: Recreate payment_eligible_clients (depends on invoices_view)
  IF to_regclass('public.invoices_view') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients: base view public.invoices_view does not exist.';
  ELSIF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients: table public.invoices does not exist.';
  ELSE
    EXECUTE 'DROP VIEW IF EXISTS public.payment_eligible_clients CASCADE';
    EXECUTE $sql$
CREATE VIEW public.payment_eligible_clients AS
SELECT
  c.id AS client_id,
  c.workspace_id,
  c.name,
  c.email,
  c.whatsapp,
  c.is_active,
  c.archived_at,
  COUNT(DISTINCT iv.id) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ) AS open_invoices_count,
  COALESCE(SUM(iv.outstanding) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ), 0) AS total_outstanding
FROM public.clients c
JOIN public.invoices_view iv
  ON iv.client_id = c.id AND iv.workspace_id = c.workspace_id
JOIN public.invoices inv
  ON inv.id = iv.id
WHERE
  iv.outstanding > 0
  AND iv.display_status IN ('sent','overdue','partially_paid')
  AND inv.archived_at IS NULL
GROUP BY
  c.id, c.workspace_id, c.name, c.email, c.whatsapp, c.is_active, c.archived_at
HAVING
  COUNT(DISTINCT iv.id) FILTER (
    WHERE iv.outstanding > 0
      AND iv.display_status IN ('sent','overdue','partially_paid')
  ) > 0;
    $sql$;
  END IF;

  -- Step 6: Add comments describing required columns
  EXECUTE $sql$
COMMENT ON VIEW public.invoices_view IS
'Canonical invoices view. Excludes archived invoices (invoices.archived_at IS NULL) and archived payments from paid calculations. Required columns: id, workspace_id, client_id, client_name, invoice_number, issue_date, due_date, currency, total, paid, outstanding, base_status, display_status, is_overdue, overdue_days, risk_level, po_number, notes. Financial fields (paid, outstanding) computed ONLY from active payments sum.';
  $sql$;

  EXECUTE $sql$
COMMENT ON VIEW public.payments_view IS
'Payments view with joined client_name and invoice_number for sorting/searching. Includes ALL payments (archived and active). App must filter by archived_at. Currency fallback: p.currency -> i.currency -> s.default_currency -> ''USD''. Required columns: id, workspace_id, invoice_id, client_id, amount, currency, transaction_fee, net_amount, payment_date, method, status, transaction_id, proof_url, notes, payment_provider, created_at, updated_at, archived_at, invoice_number (from invoices), client_name (from clients), is_failed, paid_at.';
  $sql$;

  EXECUTE $sql$
COMMENT ON VIEW public.invoice_risk_view IS
'Thin view over invoices_view for dashboard/risk pages. Includes only overdue invoices (display_status = ''overdue'') with outstanding > 0 and valid workspace_id. Excludes archived invoices and archived payments implicitly via invoices_view. Required columns: workspace_id, invoice_id, client_id, client_name, invoice_number, issue_date, due_date, currency, total, paid, outstanding, overdue_days, risk_level, display_status. Recommended ordering: ORDER BY risk_level, overdue_days DESC, outstanding DESC.';
  $sql$;

  -- Reload PostgREST schema cache
  PERFORM pg_notify('pgrst', 'reload schema');
END
$$;

