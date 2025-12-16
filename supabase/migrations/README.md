# Supabase Migrations

This directory contains database migrations for the FlowCollect application.

## Applying Migrations

### Option 1: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of the migration file
4. Run the SQL

### Option 2: Using Supabase CLI
If you have the Supabase CLI installed:

```bash
# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push
```

## Regenerating TypeScript Types

After applying migrations, regenerate TypeScript types to include the new columns:

### Using Supabase CLI

```bash
# Generate types
supabase gen types typescript --project-id your-project-id > lib/supabase/database.types.ts
```

Or if using a local connection:

```bash
supabase gen types typescript --local > lib/supabase/database.types.ts
```

### Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Scroll down to "Project API keys"
4. Copy the "Project URL" and "anon public" key
5. Use the Supabase CLI or online type generator to generate types

## Migration: Add AR Columns to Invoices

**File:** `20251121032141_add_ar_columns_to_invoices.sql`

**Adds:**
- `payment_state` (TEXT) - Derived payment state: 'unpaid', 'partially_paid', or 'paid'
- `is_overdue` (BOOLEAN) - Derived flag indicating if invoice is overdue
- `total_paid` (NUMERIC) - Sum of all completed payments
- `outstanding_amount` (NUMERIC) - Remaining amount to be paid

**Safe Migration:** Only adds columns if they don't already exist. Uses `IF NOT EXISTS` protection. Existing rows will have default values, and server actions will derive correct values on next edit or payment.

**Note:** This migration does NOT backfill existing invoice values. The server-side logic in `deriveInvoiceState()` will calculate and update these fields when invoices or payments are modified.

