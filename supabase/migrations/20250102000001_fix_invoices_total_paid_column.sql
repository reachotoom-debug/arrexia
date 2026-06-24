-- ============================================================================
-- Fix invoices.total_paid column
-- ============================================================================
-- 
-- Ensures public.invoices has a numeric NOT NULL DEFAULT 0 column named total_paid.
-- This column is used by invoices_view to calculate outstanding amounts.
-- ============================================================================

DO $$
BEGIN
  -- Check if public.invoices table exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
  ) THEN
    RAISE NOTICE 'Skipping total_paid column migration: table public.invoices does not exist.';
    RETURN;
  END IF;

  -- Check if total_paid column already exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'total_paid'
  ) THEN
    -- Add the column
    ALTER TABLE public.invoices
      ADD COLUMN total_paid numeric NOT NULL DEFAULT 0;
    
    RAISE NOTICE 'Added total_paid column to public.invoices table.';
  ELSE
    RAISE NOTICE 'Column total_paid already exists in public.invoices table.';
  END IF;

END $$;

