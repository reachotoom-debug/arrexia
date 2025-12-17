-- Create workspace_plans table for workspace-scoped billing plans
create table if not exists public.workspace_plans (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    plan text not null default 'free' check (plan in ('free','starter','pro')),
    invoice_limit_monthly integer,
    client_limit integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function public.set_workspace_plans_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists workspace_plans_set_updated_at on public.workspace_plans;
create trigger workspace_plans_set_updated_at
before update on public.workspace_plans
for each row execute function public.set_workspace_plans_updated_at();

-- Seed existing workspaces with default free plan
insert into public.workspace_plans (workspace_id, plan, invoice_limit_monthly, client_limit)
select id, 'free', 5, 5 from public.workspaces
on conflict (workspace_id) do nothing;

-- Enable RLS and allow members to read their workspace plan
alter table public.workspace_plans enable row level security;

drop policy if exists "Workspace members can select workspace_plans" on public.workspace_plans;
create policy "Workspace members can select workspace_plans"
on public.workspace_plans
for select
using (
    exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = workspace_plans.workspace_id
          and wm.user_id = auth.uid()
    )
);
