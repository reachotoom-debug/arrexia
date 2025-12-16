-- ============================================================================
-- Add missing fields to reminder_templates and reminder_rules for Settings UI
-- ============================================================================
-- 
-- This migration adds fields needed for the complete Reminders Settings UI:
-- - reminder_templates: description, channel, is_default
-- - reminder_rules: name
--
-- These fields are optional and have safe defaults to not break existing data.
-- ============================================================================

-- ============================================================================
-- REMINDER_TEMPLATES: Add missing fields
-- ============================================================================

-- Add description field (nullable)
ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add channel field (default 'email' for backward compatibility)
ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';

-- Add is_default field (default false)
ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Update existing templates to have channel = 'email' if NULL (safety)
UPDATE public.reminder_templates
SET channel = 'email'
WHERE channel IS NULL;

-- ============================================================================
-- REMINDER_RULES: Add missing name field
-- ============================================================================

-- Add name field (nullable first, then backfill, then make NOT NULL)
ALTER TABLE public.reminder_rules
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Generate default names for existing rules based on trigger_type and offset_days
-- Handle both old 'relative_to_due_date' format (with negative offsets) and new format
UPDATE public.reminder_rules
SET name = CASE
  WHEN trigger_type = 'before_due' THEN format('%s days before due', offset_days)
  WHEN trigger_type = 'on_due' THEN 'On due date'
  WHEN trigger_type = 'after_due' THEN format('%s days after due', offset_days)
  WHEN trigger_type = 'relative_to_due_date' AND offset_days < 0 THEN format('%s days before due', ABS(offset_days))
  WHEN trigger_type = 'relative_to_due_date' AND offset_days = 0 THEN 'On due date'
  WHEN trigger_type = 'relative_to_due_date' AND offset_days > 0 THEN format('%s days after due', offset_days)
  ELSE format('Reminder Rule (%s, %s days)', trigger_type, offset_days)
END
WHERE name IS NULL OR name = '';

-- Set a fallback for any remaining NULLs (shouldn't happen, but safety check)
UPDATE public.reminder_rules
SET name = format('Reminder Rule %s', SUBSTRING(id::text, 1, 8))
WHERE name IS NULL OR name = '';

-- Now make it NOT NULL after backfilling (only if all rows have names)
DO $$
BEGIN
  -- Check if there are any NULL names
  IF NOT EXISTS (SELECT 1 FROM public.reminder_rules WHERE name IS NULL) THEN
    ALTER TABLE public.reminder_rules
      ALTER COLUMN name SET NOT NULL;
  ELSE
    -- If there are NULLs, set a default for them first
    UPDATE public.reminder_rules
    SET name = format('Rule %s', id::text)
    WHERE name IS NULL;
    
    -- Then make NOT NULL
    ALTER TABLE public.reminder_rules
      ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN public.reminder_templates.description IS 
  'Optional description of the template purpose';

COMMENT ON COLUMN public.reminder_templates.channel IS 
  'Delivery channel: email, whatsapp, etc.';

COMMENT ON COLUMN public.reminder_templates.is_default IS 
  'Whether this template is the default for the workspace';

COMMENT ON COLUMN public.reminder_rules.name IS 
  'Human-readable name for the reminder rule';
