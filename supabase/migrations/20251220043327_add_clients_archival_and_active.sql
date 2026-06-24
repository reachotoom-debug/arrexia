-- ============================================================================
-- Add archived_at and is_active columns to clients table
-- ============================================================================
-- This migration safely adds both columns needed for soft-delete and active status
-- Safe to run multiple times (idempotent) - uses IF NOT EXISTS guards
-- ============================================================================

DO $$
BEGIN
  -- Check if clients table exists
  IF to_regclass('public.clients') IS NULL THEN
    RAISE NOTICE 'Skipping clients archival and active migration: table public.clients does not exist.';
    RETURN;
  END IF;

  -- Add archived_at column for soft-delete functionality
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

  -- Add is_active column for business logic status (distinct from soft-delete)
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

  -- Create index for filtering archived records (partial index for performance)
  CREATE INDEX IF NOT EXISTS idx_clients_archived_at 
    ON public.clients(archived_at) 
    WHERE archived_at IS NULL;

  -- Create index for filtering active clients (partial index for performance)
  CREATE INDEX IF NOT EXISTS idx_clients_is_active 
    ON public.clients(is_active) 
    WHERE is_active = true;

  -- Update existing clients: set is_active based on status field (only if is_active is NULL)
  -- This handles existing rows that might have been created before the column existed
  -- Safe: Only references status column if it exists (uses dynamic SQL)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'status'
  ) THEN
    EXECUTE $sql$
      UPDATE public.clients
      SET is_active = CASE
        WHEN status = 'active' THEN true
        WHEN status IN ('archived', 'inactive') THEN false
        ELSE true
      END
      WHERE is_active IS NULL
    $sql$;
  ELSE
    -- Fallback: use archived_at if status column doesn't exist
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'archived_at'
    ) THEN
      UPDATE public.clients
      SET is_active = CASE
        WHEN archived_at IS NOT NULL THEN false
        ELSE true
      END
      WHERE is_active IS NULL;
    END IF;
  END IF;
END
$$;

-- Add column comments for documentation
COMMENT ON COLUMN public.clients.archived_at IS 
'Soft-delete timestamp: NULL = active record, NOT NULL = archived record. Use .is("archived_at", null) in queries.';

COMMENT ON COLUMN public.clients.is_active IS 
'Business logic flag: true = active client, false = inactive client. Separate from archived_at (soft-delete).';
