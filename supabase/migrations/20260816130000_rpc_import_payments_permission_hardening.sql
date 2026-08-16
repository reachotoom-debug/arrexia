-- ============================================================================
-- Payment import RPC permission hardening (P0)
-- ============================================================================
-- Production finding: rpc_import_payments(uuid, jsonb, boolean) is callable by
-- service_role, authenticated, and anon. Legacy overloads are service_role only.
--
-- Exact historical ACL origin cannot be proven; current production ACL is
-- incorrect and must be explicitly hardened. CREATE OR REPLACE preserves
-- existing function privileges (PostgreSQL docs); do not attribute the drift
-- to CREATE OR REPLACE resetting ACLs. Plausible contributors include earlier
-- GRANT EXECUTE TO authenticated on this overload and incomplete hardening on
-- the canonical signature during migration history.
--
-- This migration:
-- 1. Explicitly restricts the guarded canonical overload to service_role only
-- 2. Drops obsolete legacy overloads with no runtime callers (unguarded bypass)
--
-- Canonical runtime overload: rpc_import_payments(uuid, jsonb, boolean)
-- App caller: supabaseAdmin().rpc(..., { p_workspace_id, p_rows, p_dry_run })
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.rpc_import_payments(uuid,jsonb,boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) TO service_role';
  END IF;
END
$$;

-- Legacy production overloads: no current application callers; unguarded bodies.
DROP FUNCTION IF EXISTS public.rpc_import_payments(boolean, json, uuid);
DROP FUNCTION IF EXISTS public.rpc_import_payments(uuid, jsonb);

SELECT pg_notify('pgrst', 'reload schema');
