-- ============================================================================
-- Create Core Tables
-- ============================================================================
-- 
-- Creates the base tables that later migrations depend on:
-- clients, invoices, invoice_items, payments, reminders, settings, message_templates
--
-- Constraints:
-- - invoices.status limited to 'draft', 'sent', 'void'
-- - invoices table MUST NOT include outstanding_amount
-- - Unique constraints on workspace-scoped fields
-- ============================================================================

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CLIENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  whatsapp text,
  is_active boolean DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one email per workspace
CREATE UNIQUE INDEX IF NOT EXISTS clients_workspace_email_unique
  ON public.clients (workspace_id, email)
  WHERE email IS NOT NULL;

-- ============================================================================
-- INVOICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id uuid,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'void')),
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  issue_date date,
  due_date date,
  po_number text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one invoice_number per workspace
CREATE UNIQUE INDEX IF NOT EXISTS invoices_workspace_invoice_number_unique
  ON public.invoices (workspace_id, invoice_number)
  WHERE archived_at IS NULL;

-- Foreign key to clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_client_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- INVOICE_ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign key to invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_items_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  invoice_id uuid,
  client_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  payment_date date,
  method text,
  status text,
  transaction_id text,
  notes text,
  payment_provider text,
  transaction_fee numeric DEFAULT 0,
  net_amount numeric,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_client_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Unique constraint: one payment per transaction_id per workspace (for active payments)
CREATE UNIQUE INDEX IF NOT EXISTS payments_workspace_transaction_id_unique
  ON public.payments (workspace_id, transaction_id)
  WHERE archived_at IS NULL AND transaction_id IS NOT NULL AND transaction_id != '';

-- ============================================================================
-- REMINDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  invoice_id uuid,
  client_id uuid,
  rule_id uuid,
  template_id uuid,
  channel text DEFAULT 'email',
  subject text,
  body text,
  status text,
  sent_at timestamptz,
  last_error text,
  error_message text,
  type text DEFAULT 'reminder',
  organization_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminders_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminders_client_id_fkey'
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  reminder_channel text DEFAULT 'email',
  default_currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one settings row per workspace
CREATE UNIQUE INDEX IF NOT EXISTS settings_workspace_unique
  ON public.settings (workspace_id);

-- ============================================================================
-- MESSAGE_TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

