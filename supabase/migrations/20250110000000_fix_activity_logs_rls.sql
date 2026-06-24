-- ============================================================================
-- Fix RLS for activity_logs table
-- ============================================================================
-- 
-- This migration:
-- 1. Adds workspace_id and actor_user_id columns if they don't exist
-- 2. Enables RLS on activity_logs
-- 3. Creates INSERT policy allowing authenticated workspace members to insert
-- 4. Creates SELECT policy allowing authenticated workspace members to read
--
-- Pattern: All policies check workspace membership via workspace_members table
-- using auth.uid() to identify the current user.
-- ============================================================================

DO $$
BEGIN
  -- Guard: Check if activity_logs table exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'activity_logs'
  ) THEN
    RAISE NOTICE 'Skipping activity_logs RLS migration: table public.activity_logs does not exist.';
    RETURN;
  END IF;
  
  -- ============================================================================
  -- ADD COLUMNS (if they don't exist)
  -- ============================================================================
  
  -- Add workspace_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
  
  -- Add actor_user_id column if it doesn't exist (prefer this over user_id for clarity)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'actor_user_id'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  
  -- Create index on workspace_id for faster lookups
  CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_id 
    ON public.activity_logs(workspace_id);
  
  -- Create index on actor_user_id for faster lookups
  CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user_id 
    ON public.activity_logs(actor_user_id);
  
  -- ============================================================================
  -- ENABLE RLS
  -- ============================================================================
  
  ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
  
  -- ============================================================================
  -- DROP EXISTING POLICIES (if any)
  -- ============================================================================
  
  DROP POLICY IF EXISTS "activity_logs_select_own_workspace" ON public.activity_logs;
  DROP POLICY IF EXISTS "activity_logs_insert_own_workspace" ON public.activity_logs;
  DROP POLICY IF EXISTS "activity_logs_update_own_workspace" ON public.activity_logs;
  DROP POLICY IF EXISTS "activity_logs_delete_own_workspace" ON public.activity_logs;
  
  -- ============================================================================
  -- SELECT POLICY
  -- ============================================================================
  -- Users can only read activity logs from workspaces they are members of
  
  CREATE POLICY "activity_logs_select_own_workspace"
    ON public.activity_logs
    FOR SELECT
    USING (
      workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
      )
    );
  
  -- ============================================================================
  -- INSERT POLICY
  -- ============================================================================
  -- Users can only insert activity logs for workspaces they are members of
  -- The workspace_id in the insert must match a workspace the user belongs to
  
  CREATE POLICY "activity_logs_insert_own_workspace"
    ON public.activity_logs
    FOR INSERT
    WITH CHECK (
      workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
      )
    );
  
  -- ============================================================================
  -- UPDATE POLICY (optional, for completeness - typically audit logs shouldn't be updated)
  -- ============================================================================
  
  CREATE POLICY "activity_logs_update_own_workspace"
    ON public.activity_logs
    FOR UPDATE
    USING (
      workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
      )
    );
  
  -- ============================================================================
  -- DELETE POLICY (optional, for completeness - typically audit logs shouldn't be deleted)
  -- ============================================================================
  
  CREATE POLICY "activity_logs_delete_own_workspace"
    ON public.activity_logs
    FOR DELETE
    USING (
      workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
      )
    );
  
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- This migration:
--   - Adds workspace_id and actor_user_id columns to activity_logs (if missing)
--   - Enables RLS on activity_logs
--   - Creates policies for SELECT, INSERT, UPDATE, DELETE
--   - All policies check workspace membership via workspace_members table
--
-- Pattern used: workspace_members join
--   All policies check: EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = activity_logs.workspace_id AND user_id = auth.uid())
--
-- ============================================================================
