# Supabase Local Development Setup

This guide covers setting up and troubleshooting Supabase for local development.

## Quick Start

If Supabase is working correctly:

```bash
npm run supabase:start
npm run supabase:reset
```

## Hard Reset (When Things Go Wrong)

If you encounter Docker-related errors or broken state, use the hard reset script:

```bash
npm run supabase:hard-reset
npm run supabase:start
```

The hard reset script will:
- Stop Supabase gracefully (if possible)
- Remove all Docker containers with "supabase" or "flowcollect" in the name
- Remove all Docker networks with "supabase" or "flowcollect" in the name
- Remove all Docker volumes with "supabase" or "flowcollect" in the name
- Prune unused Docker resources

This is safe and idempotent - you can run it multiple times.

## Common Errors and Solutions

### Error: "network supabase_network not found"
**Solution:** Run `npm run supabase:hard-reset` to clean up Docker resources, then restart.

### Error: "container already exists"
**Solution:** The hard reset script removes orphaned containers. Run `npm run supabase:hard-reset` first.

### Error: "volume is in use"
**Solution:** The hard reset script stops containers before removing volumes. Run `npm run supabase:hard-reset`.

### Error: Migration failures (SQLSTATE errors)
**Solution:** Migration errors are separate from Docker issues. Check the migration files and error messages. The hard reset only fixes Docker state, not migration logic.

### Error: "Docker daemon not running"
**Solution:** Start Docker Desktop (or your Docker daemon) before running Supabase commands.

## Manual Docker Cleanup

If the script doesn't work, you can manually clean up:

```powershell
# Stop all Supabase containers
docker ps -a --filter "name=supabase" --format "{{.Names}}" | ForEach-Object { docker rm -f $_ }

# Remove Supabase networks
docker network ls --filter "name=supabase" --format "{{.Name}}" | ForEach-Object { docker network rm $_ }

# Remove Supabase volumes (WARNING: This deletes local database data)
docker volume ls --filter "name=supabase" --format "{{.Name}}" | ForEach-Object { docker volume rm $_ }
```

## Troubleshooting Migration Issues

If migrations fail, check:
1. Migration file syntax (no UTF-8 BOM, correct SQL)
2. Migration order (dependencies must exist before dependent objects)
3. Column/table existence (migrations should guard for missing objects)
4. View column rename conflicts (use DROP VIEW + CREATE VIEW instead of CREATE OR REPLACE VIEW)

See migration files in `supabase/migrations/` for examples of safe, guarded migrations.

## Scripts Reference

- `npm run supabase:hard-reset` - Clean up all Docker resources related to Supabase
- `npm run supabase:start` - Start Supabase local instance
- `npm run supabase:reset` - Reset database and apply all migrations

## Notes

- The hard reset script is **safe** - it only removes Docker resources, not your migration files
- After a hard reset, you'll need to run `supabase:start` and `supabase:reset` to recreate everything
- Local database data will be lost after a hard reset (this is expected for development)

