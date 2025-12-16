-- ============================================================================
-- Create profiles table for user profile information
-- ============================================================================
-- 
-- This migration creates a profiles table to store user profile information
-- such as full name and avatar URL. The table is linked to auth.users via
-- the id column which references auth.users(id) on delete cascade.
-- ============================================================================

-- Create profiles table (safe)
CREATE TABLE IF NOT EXISTS public.profiles (
  -- keep your existing column definitions here
);

-- Create policy: Users can manage their own profile (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can manage their own profile'
  ) THEN
    CREATE POLICY "Users can manage their own profile"
      ON public.profiles
      FOR ALL
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;


-- Add comments for documentation
COMMENT ON TABLE public.profiles IS 
  'User profile information linked to auth.users';

COMMENT ON COLUMN public.profiles.id IS 
  'User ID, references auth.users(id)';

COMMENT ON COLUMN public.profiles.full_name IS 
  'User full name';

COMMENT ON COLUMN public.profiles.avatar_url IS 
  'URL to user avatar image';

COMMENT ON COLUMN public.profiles.created_at IS 
  'Timestamp when profile was created';

COMMENT ON COLUMN public.profiles.updated_at IS 
  'Timestamp when profile was last updated';
