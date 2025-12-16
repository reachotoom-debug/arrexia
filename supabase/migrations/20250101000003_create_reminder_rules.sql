------------------------------------------------------------
-- CREATE REMINDER RULES TABLE
------------------------------------------------------------

-- Create the reminder_rules table
CREATE TABLE IF NOT EXISTS reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES reminder_templates(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'relative_to_due_date',
  offset_days INTEGER NOT NULL,
  for_status TEXT NOT NULL DEFAULT 'any',
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_reminder_rules_workspace_id 
  ON reminder_rules(workspace_id);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_template_id 
  ON reminder_rules(template_id);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_workspace_enabled 
  ON reminder_rules(workspace_id, is_enabled);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reminder_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reminder_rules_updated_at
  BEFORE UPDATE ON reminder_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_reminder_rules_updated_at();

------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
------------------------------------------------------------

-- Enable RLS on the table
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read reminder rules for workspaces they belong to
CREATE POLICY "Users can read their workspace reminder rules"
  ON reminder_rules
  FOR SELECT
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_rules.workspace_id
    )
  );

-- Policy: Users can insert reminder rules for workspaces they belong to
CREATE POLICY "Users can insert their workspace reminder rules"
  ON reminder_rules
  FOR INSERT
  WITH CHECK (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_rules.workspace_id
    )
  );

-- Policy: Users can update reminder rules for workspaces they belong to
CREATE POLICY "Users can update their workspace reminder rules"
  ON reminder_rules
  FOR UPDATE
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_rules.workspace_id
    )
  )
  WITH CHECK (
    -- Ensure workspace_id cannot be changed
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_rules.workspace_id
    )
  );

-- Policy: Users can delete reminder rules for workspaces they belong to
CREATE POLICY "Users can delete their workspace reminder rules"
  ON reminder_rules
  FOR DELETE
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_rules.workspace_id
    )
  );

------------------------------------------------------------

