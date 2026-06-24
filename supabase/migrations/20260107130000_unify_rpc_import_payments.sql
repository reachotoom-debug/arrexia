begin;

-- Drop the old/legacy signature (rows first)
drop function if exists public.rpc_import_payments(jsonb, uuid);

-- OPTIONAL (recommended): drop & recreate the canonical one to ensure exactly one exists
-- If you do this, paste your canonical definition below.
-- drop function if exists public.rpc_import_payments(uuid, jsonb);

commit;
