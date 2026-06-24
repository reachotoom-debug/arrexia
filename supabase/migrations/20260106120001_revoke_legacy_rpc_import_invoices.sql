-- ============================================================================
-- Revoke execute permission on legacy rpc_import_invoices function
-- ============================================================================
-- 
-- This migration hardens against accidental legacy usage by revoking
-- execute permissions on the old rpc_import_invoices function.
-- 
-- The new function import_invoices_grouped should be used instead.
-- 
-- ============================================================================

-- Revoke execute permission from all roles
REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM service_role;

-- Add comment explaining why it's disabled
COMMENT ON FUNCTION public.rpc_import_invoices(uuid, jsonb) IS
  'LEGACY: This function is deprecated. Use import_invoices_grouped instead. Execute permission revoked.';

