-- Ensure organizations rows exist for any workspace.organization_id
-- Idempotent: inserts only missing org rows.

insert into public.organizations (id, name, created_at)
select
  w.organization_id,
  coalesce(w.name, 'Workspace Organization'),
  now()
from public.workspaces w
left join public.organizations o on o.id = w.organization_id
where w.organization_id is not null
  and o.id is null;

-- Also ensure your specific broken org exists (extra safety)
insert into public.organizations (id, name, created_at)
values ('6de76bc8-8787-48ed-ae71-cf0d2eccc021', 'Arrexia Org', now())
on conflict (id) do nothing;
