-- ============================================================================
-- Fix activity_logs.user_id foreign key constraint
-- ============================================================================
-- 
-- PROBLEM:
-- activity_logs.user_id has a foreign key constraint that doesn't reference
-- auth.users(id), causing insertion failures when inserting userId from auth.users.
--
-- SOLUTION:
-- 1. Drop existing constraint activity_logs_user_id_fkey if it exists
-- 2. Ensure column user_id is nullable (DROP NOT NULL if needed)
-- 3. Add new FK referencing auth.users(id) with ON DELETE SET NULL
-- 4. Reload PostgREST schema cache
--
-- This allows null user_id values (e.g., for cron/auto jobs) and ensures
-- user_id references auth.users(id) correctly.
-- ============================================================================

DO $$
BEGIN
  -- Check if table exists
  IF to_regclass('public.activity_logs') IS NULL THEN
    RAISE NOTICE 'Skipping activity_logs user_id FK migration: table public.activity_logs does not exist.';
    RETURN;
  END IF;

  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'activity_logs' 
      AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'Skipping: activity_logs.user_id column does not exist.';
    RETURN;
  END IF;

  -- Step 1: Drop existing constraint if it exists
  ALTER TABLE public.activity_logs 
    DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;

  -- Step 2: Make user_id nullable (if it's not already)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'activity_logs' 
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.activity_logs 
      ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- Step 3: Add new FK constraint referencing auth.users(id) with ON DELETE SET NULL
  ALTER TABLE public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE SET NULL;

  -- Step 4: Reload PostgREST schema cache (important for Supabase API)
  PERFORM pg_notify('pgrst', 'reload schema');
END
$$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- This migration:
--   - Drops existing activity_logs_user_id_fkey constraint
--   - Makes user_id column nullable (if it wasn't already)
--   - Adds new FK constraint: user_id REFERENCES auth.users(id) ON DELETE SET NULL
--   - Reloads PostgREST schema cache
--
-- Result:
--   - Audit logging can now insert userId from auth.users without FK violations
--   - user_id can be null (e.g., for cron/auto jobs)
--   - When a user is deleted from auth.users, their user_id in activity_logs becomes NULL
--
-- ============================================================================
