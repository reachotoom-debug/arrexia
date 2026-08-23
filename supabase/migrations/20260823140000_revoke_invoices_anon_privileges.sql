-- ============================================================================
-- Defense-in-depth: revoke direct anonymous table privileges on public.invoices
-- ============================================================================
--
-- View Invoice Online V1 uses a narrow server-side service-role loader at
-- /i/{token}. Anonymous users have no legitimate direct table access path.
--
-- RLS already requires auth.uid() workspace membership for invoice rows.
-- This migration removes table-level anon (and PUBLIC) privileges so anon
-- cannot bypass RLS via PostgREST even if a policy were misconfigured.
--
-- Does NOT:
-- - alter RLS policies on public.invoices
-- - change authenticated or service_role direct schema grants
-- - modify invoices_view or financial-view security
-- ============================================================================

REVOKE ALL ON TABLE public.invoices FROM anon;

-- Supabase default schema grants may also grant table privileges via PUBLIC.
-- authenticated and service_role retain their existing direct grants.
REVOKE ALL ON TABLE public.invoices FROM PUBLIC;

SELECT pg_notify('pgrst', 'reload schema');
