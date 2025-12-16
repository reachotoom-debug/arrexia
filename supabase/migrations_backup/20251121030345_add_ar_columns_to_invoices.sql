-- Migration: Add AR (Accounts Receivable) derived columns to invoices table
-- These columns are calculated and maintained by server-side logic
-- Safe migration: only adds columns if they don't already exist

-- Add payment_state column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'payment_state'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN payment_state TEXT 
        CHECK (payment_state IN ('unpaid', 'partially_paid', 'paid')) 
        DEFAULT 'unpaid';
        
        -- Update existing rows to have default value
        UPDATE invoices 
        SET payment_state = 'unpaid' 
        WHERE payment_state IS NULL;
    END IF;
END $$;

-- Add is_overdue column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'is_overdue'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN is_overdue BOOLEAN DEFAULT false;
        
        -- Update existing rows to have default value
        UPDATE invoices 
        SET is_overdue = false 
        WHERE is_overdue IS NULL;
    END IF;
END $$;

-- Add total_paid column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'total_paid'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN total_paid NUMERIC DEFAULT 0;
        
        -- Update existing rows to have default value
        UPDATE invoices 
        SET total_paid = 0 
        WHERE total_paid IS NULL;
    END IF;
END $$;

-- Add outstanding_amount column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'outstanding_amount'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN outstanding_amount NUMERIC DEFAULT 0;
        
        -- Update existing rows to have default value
        -- For existing invoices, outstanding_amount should be calculated from total_amount - total_paid
        -- But since we're initializing, we'll set it to 0 and let the server logic recalculate
        UPDATE invoices 
        SET outstanding_amount = 0 
        WHERE outstanding_amount IS NULL;
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN invoices.payment_state IS 'Derived payment state: unpaid, partially_paid, or paid. Calculated from payments.';
COMMENT ON COLUMN invoices.is_overdue IS 'Derived flag indicating if invoice is overdue. Calculated from due_date and outstanding_amount.';
COMMENT ON COLUMN invoices.total_paid IS 'Sum of all completed payments for this invoice. Calculated from payments table.';
COMMENT ON COLUMN invoices.outstanding_amount IS 'Remaining amount to be paid (total_amount - total_paid). Calculated from payments.';

