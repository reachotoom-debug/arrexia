------------------------------------------------------------
-- R2F: Ensure automation settings columns exist on public.settings
--
-- types/supabase.ts already documents these columns, but no prior repository
-- migration created auto_send_reminders / reminder_before_days / reminder_after_days.
-- reminder_channel exists from 20250102000000_create_core_tables.sql.
--
-- Idempotent: safe on databases that already have the columns.
-- Preserves legacy values; new rows default automation to explicit opt-out (false).
------------------------------------------------------------

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS auto_send_reminders boolean NOT NULL DEFAULT false;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reminder_before_days integer NOT NULL DEFAULT 3;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reminder_after_days integer NOT NULL DEFAULT 7;

COMMENT ON COLUMN public.settings.auto_send_reminders IS
  'Master switch for automatic reminder cron sending. Manual/suggested sends are unaffected.';

COMMENT ON COLUMN public.settings.reminder_before_days IS
  'Legacy settings UI field; R2 timing is controlled by reminder_rules. Preserved for backward compatibility.';

COMMENT ON COLUMN public.settings.reminder_after_days IS
  'Legacy settings UI field; R2 timing is controlled by reminder_rules. Preserved for backward compatibility.';
