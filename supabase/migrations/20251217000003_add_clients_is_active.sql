-- ============================================================================
-- 20251217000003_add_clients_is_active.sql
-- Add clients.is_active and backfill safely (compatible with legacy schemas)
-- ============================================================================

DO $$
BEGIN
  -- Check if clients table exists
  IF to_regclass('public.clients') IS NULL THEN
    RAISE NOTICE 'Skipping clients.is_active migration: table public.clients does not exist.';
    RETURN;
  END IF;

  -- Add is_active column
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

  -- Backfill is_active based on archived_at if it exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='archived_at'
  ) THEN
    UPDATE public.clients
    SET is_active = CASE
      WHEN archived_at IS NOT NULL THEN false
      ELSE true
    END
    WHERE is_active IS NULL;
  END IF;

  -- Only reference clients.status if it exists (use dynamic SQL to avoid parse-time errors)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='status'
  ) THEN
    EXECUTE $sql$
      UPDATE public.clients
      SET is_active = CASE
        WHEN archived_at IS NOT NULL THEN false
        WHEN status = 'active' THEN true
        WHEN status IN ('archived', 'inactive') THEN false
        ELSE true
      END
      WHERE is_active IS NULL
    $sql$;
  END IF;
END $$;

-- Helpful index for filtering active clients per workspace (ignoring archived rows)
CREATE INDEX IF NOT EXISTS idx_clients_is_active
  ON public.clients(is_active)
  WHERE is_active = true;

-- Only create this index if archived_at column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='archived_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS clients_workspace_is_active_idx
      ON public.clients (workspace_id, is_active)
      WHERE archived_at IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.clients.is_active IS
'Business logic flag: true = active client, false = inactive client. Separate from archived_at (soft-delete).';
