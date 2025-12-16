-- ============================================================================
-- RLS Hardening for Multi-Tenant Safety
-- ============================================================================
-- 
-- This migration enforces strict Row Level Security (RLS) for all 
-- workspace-scoped tables to ensure multi-tenant data isolation.
--
-- Pattern: All policies check workspace membership via workspace_members table
-- using auth.uid() to identify the current user.
--
-- Tables covered:
-- - clients (workspace_id)
-- - invoices (workspace_id)
-- - invoice_items (via invoice -> workspace_id)
-- - payments (workspace_id)
-- - reminders (workspace_id)
-- - workspace_email_settings (workspace_id)
-- - settings (workspace_id)
-- - message_templates (workspace_id)
-- - invoice_delivery_logs (workspace_id) - updates existing weak policies
-- - reminder_rules (workspace_id) - updates existing weak policies
-- - reminder_templates (workspace_id) - updates existing weak policies
--
-- Pattern used: workspace_members join (not JWT claims)
-- ============================================================================

-- ============================================================================
-- CLIENTS
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to replace with stricter ones)
DROP POLICY IF EXISTS "clients_select_own_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_own_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_update_own_workspace" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_own_workspace" ON public.clients;

-- SELECT: Users can only read clients from their workspaces
CREATE POLICY "clients_select_own_workspace"
  ON public.clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert clients into their workspaces
CREATE POLICY "clients_insert_own_workspace"
  ON public.clients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update clients in their workspaces
CREATE POLICY "clients_update_own_workspace"
  ON public.clients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete clients from their workspaces
CREATE POLICY "clients_delete_own_workspace"
  ON public.clients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INVOICES
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "invoices_select_own_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_own_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_own_workspace" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_own_workspace" ON public.invoices;

-- SELECT: Users can only read invoices from their workspaces
CREATE POLICY "invoices_select_own_workspace"
  ON public.invoices
  FOR SELECT
  USING (
    invoices.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert invoices into their workspaces
CREATE POLICY "invoices_insert_own_workspace"
  ON public.invoices
  FOR INSERT
  WITH CHECK (
    invoices.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update invoices in their workspaces
CREATE POLICY "invoices_update_own_workspace"
  ON public.invoices
  FOR UPDATE
  USING (
    invoices.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    invoices.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete invoices from their workspaces
CREATE POLICY "invoices_delete_own_workspace"
  ON public.invoices
  FOR DELETE
  USING (
    invoices.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INVOICE_ITEMS
-- ============================================================================
-- Note: invoice_items doesn't have workspace_id directly, but is scoped via invoice

-- Enable RLS if not already enabled
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "invoice_items_select_own_workspace" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_own_workspace" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_own_workspace" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_own_workspace" ON public.invoice_items;

-- SELECT: Users can only read invoice items for invoices in their workspaces
CREATE POLICY "invoice_items_select_own_workspace"
  ON public.invoice_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = invoice_items.invoice_id
        AND i.workspace_id IS NOT NULL
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert invoice items for invoices in their workspaces
CREATE POLICY "invoice_items_insert_own_workspace"
  ON public.invoice_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = invoice_items.invoice_id
        AND i.workspace_id IS NOT NULL
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update invoice items for invoices in their workspaces
CREATE POLICY "invoice_items_update_own_workspace"
  ON public.invoice_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = invoice_items.invoice_id
        AND i.workspace_id IS NOT NULL
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = invoice_items.invoice_id
        AND i.workspace_id IS NOT NULL
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete invoice items for invoices in their workspaces
CREATE POLICY "invoice_items_delete_own_workspace"
  ON public.invoice_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = invoice_items.invoice_id
        AND i.workspace_id IS NOT NULL
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PAYMENTS
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "payments_select_own_workspace" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_own_workspace" ON public.payments;
DROP POLICY IF EXISTS "payments_update_own_workspace" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_own_workspace" ON public.payments;

-- SELECT: Users can only read payments from their workspaces
CREATE POLICY "payments_select_own_workspace"
  ON public.payments
  FOR SELECT
  USING (
    payments.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert payments into their workspaces
CREATE POLICY "payments_insert_own_workspace"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    payments.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update payments in their workspaces
CREATE POLICY "payments_update_own_workspace"
  ON public.payments
  FOR UPDATE
  USING (
    payments.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    payments.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete payments from their workspaces
CREATE POLICY "payments_delete_own_workspace"
  ON public.payments
  FOR DELETE
  USING (
    payments.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- REMINDERS (send logs)
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "reminders_select_own_workspace" ON public.reminders;
DROP POLICY IF EXISTS "reminders_insert_own_workspace" ON public.reminders;
DROP POLICY IF EXISTS "reminders_update_own_workspace" ON public.reminders;
DROP POLICY IF EXISTS "reminders_delete_own_workspace" ON public.reminders;

-- SELECT: Users can only read reminders from their workspaces
CREATE POLICY "reminders_select_own_workspace"
  ON public.reminders
  FOR SELECT
  USING (
    reminders.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert reminders into their workspaces
CREATE POLICY "reminders_insert_own_workspace"
  ON public.reminders
  FOR INSERT
  WITH CHECK (
    reminders.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update reminders in their workspaces
CREATE POLICY "reminders_update_own_workspace"
  ON public.reminders
  FOR UPDATE
  USING (
    reminders.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    reminders.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete reminders from their workspaces
CREATE POLICY "reminders_delete_own_workspace"
  ON public.reminders
  FOR DELETE
  USING (
    reminders.workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- WORKSPACE_EMAIL_SETTINGS
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.workspace_email_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "workspace_email_settings_select_own_workspace" ON public.workspace_email_settings;
DROP POLICY IF EXISTS "workspace_email_settings_insert_own_workspace" ON public.workspace_email_settings;
DROP POLICY IF EXISTS "workspace_email_settings_update_own_workspace" ON public.workspace_email_settings;
DROP POLICY IF EXISTS "workspace_email_settings_delete_own_workspace" ON public.workspace_email_settings;

-- SELECT: Users can only read email settings for their workspaces
CREATE POLICY "workspace_email_settings_select_own_workspace"
  ON public.workspace_email_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_email_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert email settings for their workspaces
CREATE POLICY "workspace_email_settings_insert_own_workspace"
  ON public.workspace_email_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_email_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update email settings for their workspaces
CREATE POLICY "workspace_email_settings_update_own_workspace"
  ON public.workspace_email_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_email_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_email_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete email settings for their workspaces
CREATE POLICY "workspace_email_settings_delete_own_workspace"
  ON public.workspace_email_settings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_email_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- SETTINGS (workspace settings)
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "settings_select_own_workspace" ON public.settings;
DROP POLICY IF EXISTS "settings_insert_own_workspace" ON public.settings;
DROP POLICY IF EXISTS "settings_update_own_workspace" ON public.settings;
DROP POLICY IF EXISTS "settings_delete_own_workspace" ON public.settings;

-- SELECT: Users can only read settings for their workspaces
CREATE POLICY "settings_select_own_workspace"
  ON public.settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert settings for their workspaces
CREATE POLICY "settings_insert_own_workspace"
  ON public.settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update settings for their workspaces
CREATE POLICY "settings_update_own_workspace"
  ON public.settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete settings for their workspaces
CREATE POLICY "settings_delete_own_workspace"
  ON public.settings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- MESSAGE_TEMPLATES
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "message_templates_select_own_workspace" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_insert_own_workspace" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_update_own_workspace" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_delete_own_workspace" ON public.message_templates;

-- SELECT: Users can only read message templates from their workspaces
CREATE POLICY "message_templates_select_own_workspace"
  ON public.message_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert message templates into their workspaces
CREATE POLICY "message_templates_insert_own_workspace"
  ON public.message_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update message templates in their workspaces
CREATE POLICY "message_templates_update_own_workspace"
  ON public.message_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete message templates from their workspaces
CREATE POLICY "message_templates_delete_own_workspace"
  ON public.message_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = message_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INVOICE_DELIVERY_LOGS (update existing weak policies)
-- ============================================================================

-- RLS is already enabled, but policies are weak - replace them

-- Drop existing weak policies
DROP POLICY IF EXISTS "Users can read their workspace invoice delivery logs" ON public.invoice_delivery_logs;
DROP POLICY IF EXISTS "Users can insert their workspace invoice delivery logs" ON public.invoice_delivery_logs;

-- SELECT: Users can only read invoice delivery logs from their workspaces
CREATE POLICY "invoice_delivery_logs_select_own_workspace"
  ON public.invoice_delivery_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_delivery_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert invoice delivery logs into their workspaces
CREATE POLICY "invoice_delivery_logs_insert_own_workspace"
  ON public.invoice_delivery_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_delivery_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update invoice delivery logs in their workspaces
CREATE POLICY "invoice_delivery_logs_update_own_workspace"
  ON public.invoice_delivery_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_delivery_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_delivery_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete invoice delivery logs from their workspaces
CREATE POLICY "invoice_delivery_logs_delete_own_workspace"
  ON public.invoice_delivery_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_delivery_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- REMINDER_RULES (update existing weak policies)
-- ============================================================================

-- RLS is already enabled, but policies are weak - replace them

-- Drop existing weak policies
DROP POLICY IF EXISTS "Users can read their workspace reminder rules" ON reminder_rules;
DROP POLICY IF EXISTS "Users can insert their workspace reminder rules" ON reminder_rules;
DROP POLICY IF EXISTS "Users can update their workspace reminder rules" ON reminder_rules;
DROP POLICY IF EXISTS "Users can delete their workspace reminder rules" ON reminder_rules;

-- SELECT: Users can only read reminder rules from their workspaces
CREATE POLICY "reminder_rules_select_own_workspace"
  ON reminder_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert reminder rules into their workspaces
CREATE POLICY "reminder_rules_insert_own_workspace"
  ON reminder_rules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update reminder rules in their workspaces
CREATE POLICY "reminder_rules_update_own_workspace"
  ON reminder_rules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete reminder rules from their workspaces
CREATE POLICY "reminder_rules_delete_own_workspace"
  ON reminder_rules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- REMINDER_TEMPLATES (update existing weak policies)
-- ============================================================================

-- RLS is already enabled, but policies are weak - replace them

-- Drop existing weak policies
DROP POLICY IF EXISTS "Users can read their workspace reminder templates" ON reminder_templates;
DROP POLICY IF EXISTS "Users can insert their workspace reminder templates" ON reminder_templates;
DROP POLICY IF EXISTS "Users can update their workspace reminder templates" ON reminder_templates;
DROP POLICY IF EXISTS "Users can delete their workspace reminder templates" ON reminder_templates;

-- SELECT: Users can only read reminder templates from their workspaces
CREATE POLICY "reminder_templates_select_own_workspace"
  ON reminder_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can only insert reminder templates into their workspaces
CREATE POLICY "reminder_templates_insert_own_workspace"
  ON reminder_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update reminder templates in their workspaces
CREATE POLICY "reminder_templates_update_own_workspace"
  ON reminder_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- DELETE: Users can only delete reminder templates from their workspaces
CREATE POLICY "reminder_templates_delete_own_workspace"
  ON reminder_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = reminder_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- Tables with RLS enabled in this migration:
--   - clients (new)
--   - invoices (new)
--   - invoice_items (new, scoped via invoice)
--   - payments (new)
--   - reminders (new)
--   - workspace_email_settings (new)
--   - settings (new)
--   - message_templates (new)
--   - invoice_delivery_logs (updated - replaced weak policies)
--   - reminder_rules (updated - replaced weak policies)
--   - reminder_templates (updated - replaced weak policies)
--
-- Pattern used: workspace_members join
--   All policies check: EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = <table>.workspace_id AND user_id = auth.uid())
--
-- Example manual test (run in psql as authenticated user):
--   set local role authenticated;
--   set local "request.jwt.claims" to '{"sub":"<user_id>"}';
--   select count(*) from public.invoices; -- should only return rows for workspaces where user is a member
-- ============================================================================
