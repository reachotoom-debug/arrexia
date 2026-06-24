-- ============================================================================
-- Verification Query: Check if rpc_import_clients function exists
-- ============================================================================
-- 
-- Run this query in Supabase SQL Editor to verify the function was created.
-- Expected result: 1 row with function signature
-- ============================================================================

SELECT 
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'rpc_import_clients';

-- Expected output:
-- schema_name | function_name      | function_arguments                    | return_type | is_security_definer
-- public      | rpc_import_clients | p_workspace_id uuid, p_rows jsonb   | jsonb       | true

