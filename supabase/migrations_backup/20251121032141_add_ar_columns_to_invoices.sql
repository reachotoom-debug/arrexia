------------------------------------------------------------
-- ADD MISSING AR COLUMNS TO INVOICES (SAFE MIGRATION)
------------------------------------------------------------

DO $$
BEGIN
    -- payment_state ENUM-style text
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'payment_state'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN payment_state TEXT
            CHECK (payment_state IN ('unpaid','partially_paid','paid'))
            DEFAULT 'unpaid';
    END IF;

    -- is_overdue boolean
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'is_overdue'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN is_overdue BOOLEAN DEFAULT false;
    END IF;

    -- total_paid numeric
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'total_paid'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN total_paid NUMERIC DEFAULT 0;
    END IF;

    -- outstanding_amount numeric
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'outstanding_amount'
    ) THEN
        ALTER TABLE invoices
        ADD COLUMN outstanding_amount NUMERIC DEFAULT 0;
    END IF;
END $$;

------------------------------------------------------------

