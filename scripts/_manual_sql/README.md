# Manual SQL Files

**⚠️ IMPORTANT: These files are NOT executed by Supabase migrations.**

This directory contains SQL files that are kept for reference or manual execution only. They are **NOT** part of the automatic migration system in `supabase/migrations/`.

## Purpose

- Reference copies of migration logic
- Manual SQL scripts for specific tasks
- Historical queries for documentation

## Rules

- **Do NOT** add files here expecting them to run automatically
- **Do NOT** edit these files instead of the real migrations in `supabase/migrations/`
- Real migrations are in `supabase/migrations/` and run in timestamp order

## How to Use

If you need to run SQL manually:
1. Copy the relevant SQL from a file here
2. Execute it manually via Supabase CLI or dashboard
3. Or create a proper migration in `supabase/migrations/` with a timestamped filename

