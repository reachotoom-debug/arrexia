-- ============================================================================
-- Add index for (client_id, archived_at) on invoices table
-- ============================================================================
-- 
-- This index optimizes queries that filter invoices by client_id and archived_at
-- together, which is common when showing invoices for a specific client.
--
-- Example queries that benefit:
--   - SELECT * FROM invoices WHERE client_id = ? AND archived_at IS NULL
--   - SELECT * FROM invoices WHERE client_id = ? AND archived_at IS NOT NULL
-- ============================================================================

-- Add composite index for invoices (client_id, archived_at)
CREATE INDEX IF NOT EXISTS idx_invoices_client_archived 
ON public.invoices(client_id, archived_at);

COMMENT ON INDEX idx_invoices_client_archived IS 
'Composite index for client-scoped invoice queries with archived_at filtering';

