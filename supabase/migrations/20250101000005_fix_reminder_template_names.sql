------------------------------------------------------------
-- FIX REMINDER TEMPLATE NAMES
------------------------------------------------------------

-- Update any templates with null/empty names to have meaningful names based on their code
UPDATE public.reminder_templates
SET name = CASE code
  WHEN 'pre_due'  THEN 'Reminder: upcoming due date'
  WHEN 'due_day'  THEN 'Reminder: due today'
  WHEN 'plus_3'   THEN 'Reminder: 3 days overdue'
  WHEN 'plus_7'   THEN 'Reminder: 7 days overdue'
  WHEN 'final'    THEN 'Reminder: final notice'
  ELSE 'Reminder'
END
WHERE name IS NULL OR name = '' OR name = 'Unknown Template';

------------------------------------------------------------

