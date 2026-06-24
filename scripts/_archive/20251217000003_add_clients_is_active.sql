-- ============================================================================
-- 20251217000003_add_clients_is_active.sql
-- Add clients.is_active and backfill safely (compatible with legacy schemas)
-- ============================================================================

-- 1) Add the column (safe to run multiple times)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2) Backfill rules:
--    - archived_at ALWAYS means inactive
--    - if legacy clients.status exists, map it to is_active
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='clients'
      AND column_name='status'
  ) THEN
    UPDATE public.clients
    SET is_active = CASE
      WHEN archived_at IS NOT NULL THEN false
      WHEN status = 'active' THEN true
      WHEN status IN ('archived', 'inactive') THEN false
      ELSE true
    END;
  ELSE
    UPDATE public.clients
    SET is_active = CASE
      WHEN archived_at IS NOT NULL THEN false
      ELSE COALESCE(is_active, true)
    END;
  END IF;
END $$;

-- 3) Helpful index for filtering active clients fast
CREATE INDEX IF NOT EXISTS clients_workspace_is_active_idx
  ON public.clients (workspace_id, is_active)
  WHERE archived_at IS NULL;
