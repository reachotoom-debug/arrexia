-- Baseline: organizations + workspaces + workspace_members
-- This must exist before ANY workspace-scoped tables/policies.

create extension if not exists "pgcrypto";

-- 1) Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organizations_created_at on public.organizations(created_at desc);

-- 2) Workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_org_id on public.workspaces(organization_id);
create index if not exists idx_workspaces_created_at on public.workspaces(created_at desc);

-- 3) Workspace members
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);

-- 4) Helper: membership check (RLS-friendly)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

-- 5) RLS
alter table public.organizations enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Organizations: simplest safe rule = only visible through a workspace membership
-- (optional; you can tighten/expand later)
drop policy if exists organizations_select_via_workspace on public.organizations;
create policy organizations_select_via_workspace
on public.organizations for select
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    where w.organization_id = organizations.id
      and wm.user_id = auth.uid()
  )
);

-- Workspaces: members can read
drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

-- Workspace members: members can read membership rows for their workspace
drop policy if exists workspace_members_select_own on public.workspace_members;
create policy workspace_members_select_own
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Workspace members: allow inserting your first owner row (bootstrap) OR owners manage
-- Keep it simple: allow insert only when inserting yourself (bootstrap).
drop policy if exists workspace_members_insert_self on public.workspace_members;
create policy workspace_members_insert_self
on public.workspace_members for insert
to authenticated
with check (user_id = auth.uid());
