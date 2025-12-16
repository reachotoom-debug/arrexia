------------------------------------------------------------
-- CREATE WORKSPACE EMAIL SETTINGS TABLE
------------------------------------------------------------

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.workspace_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_name text,
  from_email text,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password text,
  use_tls boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Optional: one settings row per workspace
CREATE UNIQUE INDEX IF NOT EXISTS workspace_email_settings_workspace_id_idx
  ON public.workspace_email_settings (workspace_id);
