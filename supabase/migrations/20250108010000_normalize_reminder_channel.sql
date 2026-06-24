-- ============================================================================
-- Normalize reminder_channel to 'email' or 'whatsapp' only
-- ============================================================================
-- 
-- FlowCollect supports email and WhatsApp reminders (WhatsApp not yet implemented).
-- This migration ensures all existing reminder_channel values are normalized
-- to either 'email' or 'whatsapp', removing any 'sms' or invalid values.
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

  -- Normalize reminder_channel: null/invalid values become 'email'
  -- Valid values are normalized to lowercase 'email' or 'whatsapp'
  UPDATE public.settings
  SET reminder_channel = CASE
    WHEN LOWER(reminder_channel) = 'whatsapp' THEN 'whatsapp'
    ELSE 'email'
  END
  WHERE reminder_channel IS NULL
     OR LOWER(reminder_channel) NOT IN ('email', 'whatsapp')
     OR reminder_channel <> LOWER(reminder_channel);

  -- Set default for any new rows
  ALTER TABLE public.settings
    ALTER COLUMN reminder_channel SET DEFAULT 'email';

END $$;
