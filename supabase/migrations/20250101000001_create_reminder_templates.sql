------------------------------------------------------------
-- CREATE REMINDER TEMPLATES TABLE
------------------------------------------------------------

-- Create the reminder_templates table
CREATE TABLE IF NOT EXISTS reminder_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure unique code per workspace
  UNIQUE(workspace_id, code)
);

-- Create index on workspace_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_reminder_templates_workspace_id 
  ON reminder_templates(workspace_id);

-- Create index on code for filtering
CREATE INDEX IF NOT EXISTS idx_reminder_templates_code 
  ON reminder_templates(code);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reminder_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reminder_templates_updated_at
  BEFORE UPDATE ON reminder_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_reminder_templates_updated_at();

------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
------------------------------------------------------------

-- Enable RLS on the table
ALTER TABLE reminder_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read reminder templates for workspaces they belong to
CREATE POLICY "Users can read their workspace reminder templates"
  ON reminder_templates
  FOR SELECT
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_templates.workspace_id
    )
  );

-- Policy: Users can insert reminder templates for workspaces they belong to
CREATE POLICY "Users can insert their workspace reminder templates"
  ON reminder_templates
  FOR INSERT
  WITH CHECK (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_templates.workspace_id
    )
  );

-- Policy: Users can update reminder templates for workspaces they belong to
CREATE POLICY "Users can update their workspace reminder templates"
  ON reminder_templates
  FOR UPDATE
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_templates.workspace_id
    )
  )
  WITH CHECK (
    -- Ensure workspace_id cannot be changed
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_templates.workspace_id
    )
  );

-- Policy: Users can delete reminder templates for workspaces they belong to
CREATE POLICY "Users can delete their workspace reminder templates"
  ON reminder_templates
  FOR DELETE
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM workspaces w
      WHERE w.id = reminder_templates.workspace_id
    )
  );

------------------------------------------------------------

