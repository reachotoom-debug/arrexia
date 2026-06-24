-- ============================================================================
-- Normalize reminder_channel to 'email' only
-- ============================================================================
-- 
-- FlowCollect only supports email reminders. This migration ensures all
-- existing reminder_channel values in the settings table are set to 'email'.
-- ============================================================================

DO $$
BEGIN
  -- Check if public.settings table exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'settings'
  ) THEN
    RAISE NOTICE 'Skipping reminder_channel normalization: table public.settings does not exist.';
    RETURN;
  END IF;

  -- Update existing rows
  UPDATE public.settings
  SET reminder_channel = 'email'
  WHERE reminder_channel IS DISTINCT FROM 'email';

  -- Set default for any new rows
  ALTER TABLE public.settings
    ALTER COLUMN reminder_channel SET DEFAULT 'email';

END $$;
