------------------------------------------------------------
-- SEED DEFAULT REMINDER RULES FOR EXISTING WORKSPACES
------------------------------------------------------------

-- Insert default reminder rules for all existing workspaces
-- Maps templates to their trigger offsets based on template code
INSERT INTO reminder_rules (workspace_id, template_id, trigger_type, offset_days, for_status, is_enabled, sort_order)
SELECT 
  rt.workspace_id,
  rt.id as template_id,
  'relative_to_due_date' as trigger_type,
  CASE rt.code
    WHEN 'pre_due' THEN -3
    WHEN 'due_day' THEN 0
    WHEN 'plus_3' THEN 3
    WHEN 'plus_7' THEN 7
    WHEN 'final' THEN 14
    ELSE 0
  END as offset_days,
  'any' as for_status,
  true as is_enabled,
  CASE rt.code
    WHEN 'pre_due' THEN 1
    WHEN 'due_day' THEN 2
    WHEN 'plus_3' THEN 3
    WHEN 'plus_7' THEN 4
    WHEN 'final' THEN 5
    ELSE 0
  END as sort_order
FROM reminder_templates rt
WHERE rt.code IN ('pre_due', 'due_day', 'plus_3', 'plus_7', 'final')
  AND NOT EXISTS (
    SELECT 1
    FROM reminder_rules rr
    WHERE rr.workspace_id = rt.workspace_id
      AND rr.template_id = rt.id
  );

------------------------------------------------------------

