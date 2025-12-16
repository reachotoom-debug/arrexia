------------------------------------------------------------
-- SEED INITIAL REMINDER TEMPLATES FOR EXISTING WORKSPACES
------------------------------------------------------------

-- Insert default reminder templates for all existing workspaces
-- This uses a DO block to iterate through workspaces and templates
DO $$
DECLARE
  workspace_record RECORD;
  template_codes TEXT[] := ARRAY['pre_due', 'due_day', 'plus_3', 'plus_7', 'final'];
  template_names TEXT[] := ARRAY[
    'Reminder: upcoming due date',
    'Reminder: due today',
    'Reminder: 3 days overdue',
    'Reminder: 7 days overdue',
    'Reminder: final notice'
  ];
  template_subjects TEXT[] := ARRAY[
    'Payment Reminder: Invoice {{invoice_number}}',
    'Payment Due Today: Invoice {{invoice_number}}',
    'Payment Overdue: Invoice {{invoice_number}}',
    'Urgent: Payment Overdue - Invoice {{invoice_number}}',
    'Final Notice: Payment Required - Invoice {{invoice_number}}'
  ];
  template_bodies TEXT[] := ARRAY[
    'Hi {{client_name}},

This is a friendly reminder that invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.

Please ensure payment is made by the due date to avoid any late fees.

Thank you for your business!',
    'Hi {{client_name}},

This is a reminder that invoice {{invoice_number}} for {{amount_due}} is due today ({{due_date}}).

Please process payment as soon as possible to avoid any late fees.

Thank you!',
    'Hi {{client_name}},

We noticed that invoice {{invoice_number}} for {{amount_due}} is now {{days_overdue}} days overdue (due date: {{due_date}}).

Please arrange payment as soon as possible. If you have already sent payment, please disregard this message.

Thank you!',
    'Hi {{client_name}},

Invoice {{invoice_number}} for {{amount_due}} is now {{days_overdue}} days overdue (due date: {{due_date}}).

We would appreciate immediate payment to avoid further action. If you have any questions or concerns, please contact us.

Thank you!',
    'Hi {{client_name}},

This is a final notice regarding invoice {{invoice_number}} for {{amount_due}}, which is now {{days_overdue}} days overdue (due date: {{due_date}}).

Payment is required immediately. Please contact us to arrange payment or discuss payment options.

Thank you!'
  ];
  template_sort_orders INTEGER[] := ARRAY[1, 2, 3, 4, 5];
  i INTEGER;
BEGIN
  -- Loop through all workspaces
  FOR workspace_record IN SELECT id FROM workspaces
  LOOP
    -- Loop through all template types
    FOR i IN 1..array_length(template_codes, 1)
    LOOP
      -- Insert template if it doesn't already exist
      INSERT INTO reminder_templates (
        workspace_id,
        code,
        name,
        subject,
        body,
        is_enabled,
        sort_order
      )
      VALUES (
        workspace_record.id,
        template_codes[i],
        template_names[i],
        template_subjects[i],
        template_bodies[i],
        true,
        template_sort_orders[i]
      )
      ON CONFLICT (workspace_id, code) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

------------------------------------------------------------

