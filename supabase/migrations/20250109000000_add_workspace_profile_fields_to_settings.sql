-- ============================================================================
-- Add workspace profile fields to settings table
-- ============================================================================
-- 
-- This migration adds workspace profile fields to the settings table:
-- - workspace_display_name: Display name for the workspace
-- - workspace_logo_url: Logo URL for the workspace
-- - business_email: Business contact email
-- - business_phone: Business contact phone
-- - business_website: Business website URL
-- - business_country: Business country
-- - business_tax_number: Business tax/VAT number
-- - business_address_line1: Business address line 1
-- - business_address_line2: Business address line 2
-- - business_city: Business city
-- - business_state: Business state/province
-- - business_postal_code: Business postal/ZIP code
--
-- All fields are nullable text columns to allow gradual population.
-- ============================================================================

-- Add workspace profile fields
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS workspace_display_name TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS workspace_logo_url TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_email TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_phone TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_website TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_country TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_tax_number TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_address_line1 TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_address_line2 TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_city TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_state TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_postal_code TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.settings.workspace_display_name IS 
  'Display name for the workspace';

COMMENT ON COLUMN public.settings.workspace_logo_url IS 
  'Logo URL for the workspace';

COMMENT ON COLUMN public.settings.business_email IS 
  'Business contact email address';

COMMENT ON COLUMN public.settings.business_phone IS 
  'Business contact phone number';

COMMENT ON COLUMN public.settings.business_website IS 
  'Business website URL';

COMMENT ON COLUMN public.settings.business_country IS 
  'Business country';

COMMENT ON COLUMN public.settings.business_tax_number IS 
  'Business tax/VAT identification number';

COMMENT ON COLUMN public.settings.business_address_line1 IS 
  'Business address line 1';

COMMENT ON COLUMN public.settings.business_address_line2 IS 
  'Business address line 2';

COMMENT ON COLUMN public.settings.business_city IS 
  'Business city';

COMMENT ON COLUMN public.settings.business_state IS 
  'Business state/province';

COMMENT ON COLUMN public.settings.business_postal_code IS 
  'Business postal/ZIP code';
