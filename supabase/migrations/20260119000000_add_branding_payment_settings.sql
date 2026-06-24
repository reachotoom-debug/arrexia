-- Extend workspace-level settings (single source of truth for branding/payment instructions).
-- Phase 1: Settings only. Do NOT touch invoices/payments/reminders tables here.

ALTER TABLE public.settings
  -- Branding
  -- NOTE: branding_logo_url was removed; use existing workspace_logo_url column instead
  -- NOTE: branding_business_name was removed; use existing workspace_display_name column instead
  ADD COLUMN IF NOT EXISTS branding_business_legal_name text NULL,
  ADD COLUMN IF NOT EXISTS branding_business_address text NULL,
  -- NOTE: branding_business_email was removed; use existing business_email column instead
  -- NOTE: branding_business_phone was removed; use existing business_phone column instead
  -- NOTE: branding_website was removed; use existing business_website column instead
  ADD COLUMN IF NOT EXISTS branding_tax_id text NULL,
  -- Payment details
  ADD COLUMN IF NOT EXISTS payment_bank_name text NULL,
  ADD COLUMN IF NOT EXISTS payment_bank_account_name text NULL,
  ADD COLUMN IF NOT EXISTS payment_bank_account_number text NULL,
  ADD COLUMN IF NOT EXISTS payment_bank_swift text NULL,
  ADD COLUMN IF NOT EXISTS payment_bank_iban text NULL,
  ADD COLUMN IF NOT EXISTS payment_paypal_handle text NULL,
  ADD COLUMN IF NOT EXISTS payment_stripe_descriptor text NULL,
  ADD COLUMN IF NOT EXISTS payment_other_instructions text NULL,
  -- Thank-you text
  ADD COLUMN IF NOT EXISTS invoice_thank_you_note text NULL,
  -- Timezone (IANA, e.g. Asia/Amman)
  ADD COLUMN IF NOT EXISTS timezone text NULL;

