-- ============================================================================
-- Normalize reminder_channel to 'email' or 'whatsapp' only
-- ============================================================================
-- 
-- FlowCollect supports email and WhatsApp reminders (WhatsApp not yet implemented).
-- This migration ensures all existing reminder_channel values are normalized
-- to either 'email' or 'whatsapp', removing any 'sms' or invalid values.
-- ============================================================================

UPDATE public.settings
SET reminder_channel = 'email'
WHERE reminder_channel IS NULL
   OR LOWER(reminder_channel) NOT IN ('email', 'whatsapp');

-- Set default for any new rows
ALTER TABLE public.settings
  ALTER COLUMN reminder_channel SET DEFAULT 'email';
