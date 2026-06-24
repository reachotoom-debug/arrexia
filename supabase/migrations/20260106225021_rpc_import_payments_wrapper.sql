-- ============================================================================
-- Wrapper for rpc_import_payments (deprecated - function already defined correctly)
-- ============================================================================
-- 
-- This migration is a no-op. The rpc_import_payments function is already
-- correctly defined in earlier migrations (20260106150000, 20260120000000).
-- This wrapper is kept for migration history but does nothing.
-- ============================================================================

DO $$
BEGIN
  -- This migration is intentionally empty - function already exists
  RAISE NOTICE 'Skipping rpc_import_payments wrapper: function already defined in earlier migrations.';
END
$$;
