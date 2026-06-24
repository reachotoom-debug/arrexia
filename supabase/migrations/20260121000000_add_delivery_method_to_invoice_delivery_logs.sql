-- ============================================================================
-- Add delivery_method to invoice_delivery_logs (idempotent)
-- This matches what the app expects when loading invoice delivery logs.
-- ============================================================================

DO $$
BEGIN
  -- Only run if the table exists
  IF to_regclass('public.invoice_delivery_logs') IS NULL THEN
    RAISE NOTICE 'Skipping: invoice_delivery_logs does not exist.';
    RETURN;
  END IF;

  -- Add column if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'invoice_delivery_logs'
      AND column_name  = 'delivery_method'
  ) THEN
    ALTER TABLE public.invoice_delivery_logs
      ADD COLUMN delivery_method text;

    -- Optional: if there is a "channel" column, copy it as a starting point
    BEGIN
      PERFORM 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'invoice_delivery_logs'
        AND column_name  = 'channel';

      IF FOUND THEN
        UPDATE public.invoice_delivery_logs
        SET delivery_method = channel
        WHERE delivery_method IS NULL;
      END IF;
    EXCEPTION
      WHEN others THEN
        -- Don't block migration if this fails; column still exists.
        RAISE NOTICE 'Optional backfill for delivery_method from channel failed: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'delivery_method already exists on invoice_delivery_logs, skipping.';
  END IF;
END
$$;
