-- Create invoice_delivery_logs table to track invoice email sending attempts
-- This table logs all attempts to send invoices via email, including success/failure status

CREATE TABLE IF NOT EXISTS public.invoice_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_preview text,
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_delivery_logs_workspace_id 
  ON public.invoice_delivery_logs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_invoice_delivery_logs_invoice_id 
  ON public.invoice_delivery_logs(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_delivery_logs_created_at 
  ON public.invoice_delivery_logs(created_at DESC);

-- ROW LEVEL SECURITY (RLS) POLICIES
------------------------------------------------------------

-- Enable RLS on the table
ALTER TABLE public.invoice_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read invoice delivery logs for workspaces they belong to
CREATE POLICY "Users can read their workspace invoice delivery logs"
  ON public.invoice_delivery_logs
  FOR SELECT
  USING (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = invoice_delivery_logs.workspace_id
    )
  );

-- Policy: Users can insert invoice delivery logs for workspaces they belong to
CREATE POLICY "Users can insert their workspace invoice delivery logs"
  ON public.invoice_delivery_logs
  FOR INSERT
  WITH CHECK (
    -- Basic check: ensure workspace exists
    -- TODO: Add workspace membership check when workspace_members table is available
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = invoice_delivery_logs.workspace_id
    )
  );

-- Add comment to document the table
COMMENT ON TABLE public.invoice_delivery_logs IS 
  'Tracks all invoice email delivery attempts. Each row represents one send attempt with status (sent/failed), recipient email, subject, and optional error message.';
