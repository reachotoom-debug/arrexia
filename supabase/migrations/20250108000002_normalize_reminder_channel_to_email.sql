-- ============================================================================
-- Normalize reminder_channel to 'email' only
-- ============================================================================
-- 
-- FlowCollect only supports email reminders. This migration ensures all
-- existing reminder_channel values in the settings table are set to 'email'.
-- ============================================================================

UPDATE public.settings
SET reminder_channel = 'email'
WHERE reminder_channel IS NULL
   OR LOWER(reminder_channel) <> 'email';

-- Set default for any new rows
ALTER TABLE public.settings
  ALTER COLUMN reminder_channel SET DEFAULT 'email';
