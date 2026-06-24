alter table public.workspaces
add column if not exists organization_id uuid;

-- Backfill: create a 1:1 org id per workspace if missing.
-- If you already have an organizations table, we’ll link it instead (see note below).
update public.workspaces
set organization_id = gen_random_uuid()
where organization_id is null;

alter table public.workspaces
alter column organization_id set not null;

create index if not exists idx_workspaces_org_id on public.workspaces(organization_id);
