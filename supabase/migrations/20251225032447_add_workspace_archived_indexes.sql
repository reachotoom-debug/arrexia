-- ============================================================================
-- Add soft-delete support (archived_at) and workspace-scoped indexes
-- ============================================================================
-- 
-- This migration:
-- 1. Adds archived_at column to invoices and payments (if not exists)
-- 2. Adds composite indexes for workspace-scoped filtering with archived_at
--
-- These indexes optimize queries that filter by workspace_id and archived_at
-- together, which is common in workspace-scoped queries.
--
-- Example queries that benefit:
--   - SELECT * FROM invoices WHERE workspace_id = ? AND archived_at IS NULL
--   - SELECT * FROM payments WHERE workspace_id = ? AND archived_at IS NULL
--   - SELECT * FROM invoices WHERE workspace_id = ? AND archived_at IS NOT NULL
-- ============================================================================

-- Add archived_at to invoices table (if not exists)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add archived_at to payments table (if not exists)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add composite index for invoices (workspace_id, archived_at)
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_archived 
ON public.invoices(workspace_id, archived_at);

-- Add composite index for payments (workspace_id, archived_at)
CREATE INDEX IF NOT EXISTS idx_payments_workspace_archived 
ON public.payments(workspace_id, archived_at);

COMMENT ON COLUMN public.invoices.archived_at IS 
'Soft-delete timestamp: NULL = active record, NOT NULL = archived record';

COMMENT ON COLUMN public.payments.archived_at IS 
'Soft-delete timestamp: NULL = active record, NOT NULL = archived record';

COMMENT ON INDEX idx_invoices_workspace_archived IS 
'Composite index for workspace-scoped invoice queries with archived_at filtering';

COMMENT ON INDEX idx_payments_workspace_archived IS 
'Composite index for workspace-scoped payment queries with archived_at filtering';
