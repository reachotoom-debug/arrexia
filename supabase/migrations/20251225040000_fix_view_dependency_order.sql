-- Fix view dependency order: invoice_risk_view depends on invoices_view
-- Drop dependents first, then base view, then recreate.

BEGIN;

-- 1) Drop dependent views first
DROP VIEW IF EXISTS public.invoice_risk_view;

-- Optional: if payments_view references invoices_view directly, drop it too.
-- (Safe even if it doesn't)
DROP VIEW IF EXISTS public.payments_view;

-- 2) Drop base view
DROP VIEW IF EXISTS public.invoices_view;

COMMIT;

-- IMPORTANT:
-- Now, re-run your existing view creation logic by re-creating the views here
-- OR (better) convert your earlier migrations to "CREATE OR REPLACE VIEW"
-- For fastest fix: paste the final versions of invoices_view, invoice_risk_view, payments_view definitions below.

-- =========================
-- Recreate invoices_view
-- =========================
-- Paste the FINAL "CREATE VIEW public.invoices_view AS ..." definition
-- from your latest invoices_view migration (the one you want to be canonical).
-- Example:
-- CREATE VIEW public.invoices_view AS
-- SELECT ...;

-- =========================
-- Recreate invoice_risk_view
-- =========================
-- CREATE VIEW public.invoice_risk_view AS
-- SELECT ... FROM public.invoices_view ...;

-- =========================
-- Recreate payments_view
-- =========================
-- CREATE VIEW public.payments_view AS
-- SELECT ...;
