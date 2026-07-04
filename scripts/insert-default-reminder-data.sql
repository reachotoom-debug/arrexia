-- Insert default reminder template and rule for workspace
-- This script creates both records in a single transaction

BEGIN;

-- Step 1: Insert the message template and capture its ID
WITH inserted_template AS (
  INSERT INTO message_templates (
    workspace_id,
    name,
    subject,
    body,
    created_at
  ) VALUES (
    '4fcdda2b-6006-44d8-a87d-6c8b3e768374',
    'Friendly Overdue Reminder',
    'Invoice {{invoice_number}} is overdue',
    'Dear {{client_name}},

We hope you are well. This is a friendly reminder that invoice {{invoice_number}} for {{amount_due}} was due on {{due_date}} and is now {{days_overdue}} days overdue.

We would appreciate your prompt attention.

Thank you,
Arrexia',
    NOW()
  )
  RETURNING id
)
-- Step 2: Insert the reminder rule using the template ID
INSERT INTO reminder_rules (
  workspace_id,
  name,
  is_active,
  sort_order,
  template_id,
  channel,
  created_at
)
SELECT 
  '4fcdda2b-6006-44d8-a87d-6c8b3e768374',
  'Default Overdue Rule',
  true,
  1,
  id,
  'email',
  NOW()
FROM inserted_template;

COMMIT;

-- Verify the inserts
SELECT 
  mt.id as template_id,
  mt.name as template_name,
  rr.id as rule_id,
  rr.name as rule_name,
  rr.is_active
FROM message_templates mt
JOIN reminder_rules rr ON rr.template_id = mt.id
WHERE mt.workspace_id = '4fcdda2b-6006-44d8-a87d-6c8b3e768374'
  AND mt.name = 'Friendly Overdue Reminder';

