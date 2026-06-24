# Migration Instructions: Add Clients Archival and Active Columns

## Problem
The remote database at `yisuenreaursmsovsfpf.supabase.co` is missing the `archived_at` and `is_active` columns on the `public.clients` table, causing Postgres error 42703.

## Solution
Apply the migration file: `supabase/migrations/20251220043327_add_clients_archival_and_active.sql`

## How to Apply

### Option 1: Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard
2. Select your project (matching `yisuenreaursmsovsfpf.supabase.co`)
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `supabase/migrations/20251220043327_add_clients_archival_and_active.sql`
6. Paste into the SQL Editor
7. Click **Run** (or press Ctrl+Enter)
8. Verify success: You should see "Success. No rows returned"

### Option 2: Supabase CLI
If you have the Supabase CLI installed and linked:

```bash
# First, link to your project (if not already linked)
# Get your project ref from the Supabase dashboard URL or project settings
supabase link --project-ref yisuenreaursmsovsfpf

# Apply all pending migrations
supabase db push
```

Or apply just this migration:

```bash
# If you have psql access
psql "postgresql://postgres:[YOUR-PASSWORD]@db.yisuenreaursmsovsfpf.supabase.co:5432/postgres" -f supabase/migrations/20251220043327_add_clients_archival_and_active.sql
```

## Verification

After applying the migration, verify the columns exist:

```sql
-- Run this in Supabase SQL Editor
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'clients'
  AND column_name IN ('archived_at', 'is_active');
```

Expected output:
- `archived_at`: `timestamp with time zone`, `YES` (nullable), `NULL`
- `is_active`: `boolean`, `NO` (not nullable), `true`

## TypeScript Types

The types file (`types/supabase.ts`) already includes both columns, so no regeneration is needed. However, if you want to regenerate:

```bash
# Using Supabase CLI
supabase gen types typescript --project-id yisuenreaursmsovsfpf > types/supabase.ts
```

## Safety

This migration is **idempotent** - it's safe to run multiple times:
- Uses `ADD COLUMN IF NOT EXISTS` - won't error if columns already exist
- Uses `CREATE INDEX IF NOT EXISTS` - won't error if indexes already exist
- UPDATE only affects rows where `is_active IS NULL`

## After Migration

Once applied, the ClientsPage should load without errors. The query already:
- Selects both `archived_at` and `is_active` columns
- Uses `.is("archived_at", null)` for null checks (correct PostgREST syntax)
- Maintains workspace scoping with `.eq("workspace_id", workspaceId)`
