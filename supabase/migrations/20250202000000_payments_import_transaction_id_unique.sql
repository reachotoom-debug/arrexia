-- ============================================================================
-- Payments Import: Unique Index on (workspace_id, transaction_id)
-- ============================================================================
-- 
-- Creates a unique index to support CSV import deduplication by transaction_id.
-- Only applies to active (non-archived) payments with non-empty transaction_id.
-- This allows multiple payments with the same transaction_id if one is archived.
-- ============================================================================

-- Create unique index on (workspace_id, transaction_id) where archived_at is null and transaction_id is not empty
CREATE UNIQUE INDEX IF NOT EXISTS payments_workspace_transaction_id_unique
ON public.payments (workspace_id, transaction_id)
WHERE archived_at IS NULL 
  AND transaction_id IS NOT NULL 
  AND transaction_id != '';

-- Add comment to document the index
COMMENT ON INDEX payments_workspace_transaction_id_unique IS 
  'Ensures unique transaction_id per workspace for active payments. Used for CSV import deduplication.';

