-- ============================================================================
-- Ensure payments table has all columns required by payments_view contract
-- ============================================================================
-- This migration ensures the payments table has all columns that payments_view
-- expects. It's safe to run multiple times (idempotent).
-- ============================================================================

DO $$
BEGIN
  -- Check if payments table exists
  IF to_regclass('public.payments') IS NULL THEN
    RAISE NOTICE 'Skipping payments contract columns migration: table public.payments does not exist.';
    RETURN;
  END IF;

  -- Add client_id if missing
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.payments 
      ADD COLUMN client_id uuid;
    
    RAISE NOTICE 'Added client_id column to public.payments table.';
    
    -- Add index on client_id for performance
    CREATE INDEX IF NOT EXISTS idx_payments_client_id 
      ON public.payments(client_id) 
      WHERE client_id IS NOT NULL;
  END IF;

  -- Add transaction_fee if missing
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'transaction_fee'
  ) THEN
    ALTER TABLE public.payments 
      ADD COLUMN transaction_fee numeric DEFAULT 0;
    
    RAISE NOTICE 'Added transaction_fee column to public.payments table.';
  END IF;

  -- Add net_amount if missing
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'net_amount'
  ) THEN
    ALTER TABLE public.payments 
      ADD COLUMN net_amount numeric;
    
    RAISE NOTICE 'Added net_amount column to public.payments table.';
  END IF;

  -- Add payment_provider if missing
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE public.payments 
      ADD COLUMN payment_provider text;
    
    RAISE NOTICE 'Added payment_provider column to public.payments table.';
  END IF;

  -- Add proof_url if missing
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'payments' 
      AND column_name = 'proof_url'
  ) THEN
    ALTER TABLE public.payments 
      ADD COLUMN proof_url text;
    
    RAISE NOTICE 'Added proof_url column to public.payments table.';
  END IF;

  -- Backfill transaction_fee where null
  UPDATE public.payments 
  SET transaction_fee = 0 
  WHERE transaction_fee IS NULL;

  -- Backfill net_amount where null: net_amount = amount - COALESCE(transaction_fee, 0)
  UPDATE public.payments 
  SET net_amount = amount - COALESCE(transaction_fee, 0)
  WHERE net_amount IS NULL AND amount IS NOT NULL;

END
$$;

-- Add column comments
COMMENT ON COLUMN public.payments.client_id IS 
'Direct client reference (optional). Falls back to invoice.client_id if not set.';

COMMENT ON COLUMN public.payments.transaction_fee IS 
'Transaction fee charged by payment provider (default: 0).';

COMMENT ON COLUMN public.payments.net_amount IS 
'Net amount after transaction fees: amount - transaction_fee. Calculated automatically if null.';

COMMENT ON COLUMN public.payments.payment_provider IS 
'Payment provider name (e.g., "stripe", "paypal", "bank_transfer").';

COMMENT ON COLUMN public.payments.proof_url IS 
'Optional URL to payment proof document (e.g., receipt, screenshot, bank statement). Used for audit and verification purposes.';
