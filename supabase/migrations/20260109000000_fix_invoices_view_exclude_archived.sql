-- ============================================================================
-- Fix invoices_view: exclude archived invoices and archived payments
-- ============================================================================
-- 
-- Changes:
-- 1. Exclude archived invoices (invoices.archived_at IS NOT NULL) from view entirely
-- 2. Exclude archived payments (payments.archived_at IS NOT NULL) from paid calculation
-- 3. Keep all existing logic: status precedence, partially_paid guards, risk_level calculation
-- 
-- Critical filters:
-- - invoice_payments CTE: WHERE p.archived_at IS NULL AND (status filter)
-- - invoice_calculations CTE: WHERE i.archived_at IS NULL
-- 
-- This ensures:
-- - Archived invoices never appear in invoices_view
-- - Archived payments never count toward invoice paid amounts
-- - Financial integrity: only active invoices and payments affect calculations
-- ============================================================================

-- Drop dependent views first (they depend on invoices_view)
DROP VIEW IF EXISTS public.invoice_risk_view;
DROP VIEW IF EXISTS public.payment_eligible_clients;

-- Drop invoices_view
DROP VIEW IF EXISTS public.invoices_view;

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
    p.archived_at IS NULL  -- ✅ CRITICAL: Exclude archived payments
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
    i.status AS base_status,  -- Only draft|sent|void from invoices.status
    i.amount AS total,
    COALESCE(ip.paid, 0) AS paid,  -- ONLY from payments sum, no fallback to invoices.total_paid
    GREATEST(i.amount - COALESCE(ip.paid, 0), 0) AS outstanding,  -- max(total - paid, 0)
    i.currency AS currency,  -- Explicitly from invoices table
    i.po_number AS po_number,  -- Optional field
    i.notes AS notes,  -- Optional field
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
  WHERE i.archived_at IS NULL  -- ✅ CRITICAL: Exclude archived invoices
),
invoice_status AS (
  SELECT
    *,
    -- Calculate display_status with correct precedence: void > draft > paid > overdue > partially_paid > sent
    CASE
      -- 1) Void wins (highest priority)
      WHEN base_status = 'void' THEN 'void'
      -- 2) Draft protection: drafts are never overdue
      WHEN base_status = 'draft' THEN 'draft'
      -- 3) Fully paid (not void/draft, outstanding <= 0)
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
          -- partially_paid: must have paid > 0 AND outstanding > 0
          WHEN paid > 0 AND outstanding > 0 THEN 'partially_paid'
          -- sent: paid = 0 (or outstanding = total)
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
    -- Only calculate risk for overdue invoices (display_status = 'overdue')
    WHEN display_status <> 'overdue' THEN NULL
    -- Calculate risk based on overdue_days and outstanding amount
    WHEN overdue_days >= 60 OR outstanding >= 5000 THEN 'high'
    WHEN overdue_days BETWEEN 15 AND 59 THEN 'medium'
    WHEN overdue_days BETWEEN 1 AND 14 THEN 'low'
    ELSE NULL
  END AS risk_level,
  po_number,
  notes
FROM invoice_status;

-- Recreate payment_eligible_clients view (depends on invoices_view)
DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL OR to_regclass('public.invoices_view') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients view recreation: dependencies missing.';
    RETURN;
  END IF;

  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE 'Skipping payment_eligible_clients view: table public.invoices does not exist.';
    RETURN;
  END IF;

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

  PERFORM pg_notify('pgrst', 'reload schema');
END
$$;

COMMENT ON VIEW public.invoices_view IS 
  'Canonical invoices view with stable contract. Required columns: id, workspace_id, client_id, client_name, invoice_number, issue_date, due_date, currency (nullable), total, paid, outstanding, base_status (draft/sent/void), display_status (paid/partially_paid/overdue/sent/draft/void), is_overdue (boolean), overdue_days, risk_level (high/medium/low/null), po_number (optional), notes (optional). Draft invoices are NEVER treated as overdue or risk, even if due_date is in the past. Display status precedence: void (highest priority), draft (protected from overdue), paid (outstanding <= 0), overdue (sent + outstanding > 0 + due_date < current_date), partially_paid (sent + outstanding > 0 + due_date >= current_date + paid > 0 + outstanding > 0), sent (sent + outstanding > 0 + due_date >= current_date + paid = 0). Risk levels: high (overdue_days >= 60 OR outstanding >= 5000), medium (overdue_days 15-59), low (overdue_days 1-14), NULL (not overdue). Paid amount is computed ONLY from payments sum (no fallback to invoices.total_paid). EXCLUDES archived invoices (invoices.archived_at IS NOT NULL) and archived payments (payments.archived_at IS NOT NULL) from all calculations.';

COMMENT ON VIEW public.payment_eligible_clients IS
  'Returns active, non-archived clients with at least one invoice eligible for payment recording. Eligibility: client.archived_at IS NULL AND client.is_active = true AND invoice.display_status IN (''sent'',''overdue'',''partially_paid'') AND invoice.outstanding > 0. Workspace-scoped. Use this view for Record Payment client dropdown queries.';

-- ============================================================================
-- Verification Queries (run these manually to verify the migration)
-- ============================================================================

-- Verify archived invoices are excluded from invoices_view
-- Expected result: count should be 0
-- SELECT count(*) as archived_invoices_in_view
-- FROM public.invoices_view v
-- JOIN public.invoices i ON i.id = v.id
-- WHERE i.archived_at IS NOT NULL;

-- Verify archived payments are excluded from paid calculations
-- This query shows invoices that have archived payments (which should NOT count in paid)
-- Expected: These invoices should have paid=0 in invoices_view if all their payments are archived
-- SELECT 
--   p.invoice_id,
--   i.invoice_number,
--   SUM(COALESCE(p.net_amount, p.amount)) AS archived_paid_total
-- FROM public.payments p
-- JOIN public.invoices i ON i.id = p.invoice_id
-- WHERE p.archived_at IS NOT NULL
--   AND p.status IN ('completed', 'paid') OR p.status IS NULL
-- GROUP BY p.invoice_id, i.invoice_number
-- ORDER BY archived_paid_total DESC
-- LIMIT 10;

-- Verify active invoices appear correctly
-- Expected: Should match count of non-archived invoices
-- SELECT 
--   (SELECT count(*) FROM public.invoices WHERE archived_at IS NULL) AS total_active_invoices,
--   (SELECT count(*) FROM public.invoices_view) AS invoices_in_view,
--   (SELECT count(*) FROM public.invoices WHERE archived_at IS NULL) - (SELECT count(*) FROM public.invoices_view) AS difference;

