-- ============================================================================
-- Make reminders.template_id nullable
-- ============================================================================
-- 
-- This migration makes the template_id column in the reminders table nullable
-- to allow logging reminder attempts even when no template is found.
-- This ensures history is always logged, even if template selection fails.
-- ============================================================================

-- First, update any existing rows with invalid template_id to NULL
-- (if there are any orphaned references)
UPDATE public.reminders
SET template_id = NULL
WHERE template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.reminder_templates
    WHERE reminder_templates.id = reminders.template_id
  );

-- Make the column nullable
ALTER TABLE public.reminders
  ALTER COLUMN template_id DROP NOT NULL;

