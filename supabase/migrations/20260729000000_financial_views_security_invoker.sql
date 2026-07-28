-- ============================================================================
-- Tenant isolation: enable security_invoker on canonical financial views
-- ============================================================================
--
-- Production confirmed reloptions = null on invoices_view and payments_view.
-- Definer-rights views (default) execute as owner (postgres) and bypass
-- underlying RLS. security_invoker=true applies caller RLS on base tables.
--
-- Dependent PostgREST-exposed views are included so no alternate
-- definer-rights path can leak cross-tenant financial data.
--
-- Does NOT recreate views or alter columns/calculations.
-- ============================================================================

ALTER VIEW public.invoices_view SET (security_invoker = true);
ALTER VIEW public.payments_view SET (security_invoker = true);

-- Dependent views: must also run as caller or they bypass RLS independently.
ALTER VIEW public.invoice_risk_view SET (security_invoker = true);
ALTER VIEW public.payment_eligible_clients SET (security_invoker = true);
ALTER VIEW public.payments_orphans SET (security_invoker = true);

-- Defense-in-depth: Arrexia has no legitimate anon read path for financial views.
-- Authenticated workspace members retain SELECT via default schema grants.
REVOKE SELECT ON public.invoices_view FROM anon;
REVOKE SELECT ON public.payments_view FROM anon;
REVOKE SELECT ON public.invoice_risk_view FROM anon;
REVOKE SELECT ON public.payment_eligible_clients FROM anon;
REVOKE SELECT ON public.payments_orphans FROM anon;

SELECT pg_notify('pgrst', 'reload schema');
