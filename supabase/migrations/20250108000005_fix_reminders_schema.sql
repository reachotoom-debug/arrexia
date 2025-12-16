-- ============================================================================
-- Fix Reminders Schema - Ensure required columns exist
-- ============================================================================
-- 
-- This migration ensures reminder_templates and reminder_rules have all
-- required columns for the Settings UI to work properly.
-- ============================================================================

-- ============================================================================
-- REMINDER_TEMPLATES: Ensure 'channel' and 'description' exist
-- ============================================================================

ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS description text;

-- Update any NULL channels to 'email' (safety check)
UPDATE public.reminder_templates
SET channel = 'email'
WHERE channel IS NULL;

-- ============================================================================
-- REMINDER_RULES: Ensure 'name' and 'template_id' exist
-- ============================================================================

-- Add name field if it doesn't exist
ALTER TABLE public.reminder_rules
  ADD COLUMN IF NOT EXISTS name text;

-- Backfill name for existing rows
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

-- Set fallback for any remaining NULLs
UPDATE public.reminder_rules
SET name = format('Rule %s', SUBSTRING(id::text, 1, 8))
WHERE name IS NULL OR name = '';

-- Make name NOT NULL after backfilling
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reminder_rules' 
    AND column_name = 'name'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.reminder_rules
      ALTER COLUMN name SET NOT NULL;
    
    -- Set default for any edge cases
    ALTER TABLE public.reminder_rules
      ALTER COLUMN name SET DEFAULT 'Rule';
  END IF;
END $$;

-- template_id should already exist as a foreign key, but ensure it's there
-- (Foreign key constraint already exists, so we don't recreate it)
