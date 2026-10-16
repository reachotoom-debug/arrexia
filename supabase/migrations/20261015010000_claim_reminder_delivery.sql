-- LOCAL ONLY: deploy before application code; never expire/release claims automatically.
-- Claims represent attempted external delivery, including uncertain provider outcomes.
create table public.reminder_delivery_claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  rule_id uuid,
  scheduled_date date,
  evaluation_date date not null,
  source text not null check (source in ('manual', 'auto_cron')),
  created_at timestamptz not null default now()
);
alter table public.reminder_delivery_claims enable row level security;
-- Production default privileges grant broad API rights to new tables. Remove
-- every direct API/PUBLIC privilege explicitly, including TRUNCATE/TRIGGER.
revoke all on public.reminder_delivery_claims from public, anon, authenticated;
create index reminder_delivery_claims_invoice on public.reminder_delivery_claims(workspace_id, invoice_id);
create unique index reminder_delivery_claims_rule_occurrence
  on public.reminder_delivery_claims(workspace_id, invoice_id, rule_id, scheduled_date)
  where rule_id is not null;
create unique index reminder_delivery_claims_manual_day
  on public.reminder_delivery_claims(workspace_id, invoice_id, evaluation_date)
  where source = 'manual';

create function public.claim_reminder_delivery(
  p_workspace_id uuid, p_invoice_id uuid, p_rule_id uuid,
  p_scheduled_date date, p_evaluation_date date, p_source text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_evaluation_date date;
  v_scheduled_date date;
  v_due_date date;
  v_final_rule_id uuid;
begin
  -- Inline the same authoritative membership predicate used by the application.
  -- No missing deployed helper or fixture-only helper is required.
  if auth.role() is distinct from 'service_role' and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
  ) then
    raise exception 'Workspace access denied';
  end if;
  if p_source = 'auto_cron' and auth.role() is distinct from 'service_role' then
    raise exception 'Automatic claims require service role';
  end if;
  if p_source is null or p_source not in ('manual', 'auto_cron') or p_evaluation_date is null
    or (p_rule_id is not null and p_scheduled_date is null) then
    raise exception 'Invalid reminder delivery claim';
  end if;
  if not exists (select 1 from public.invoices where id = p_invoice_id and workspace_id = p_workspace_id) then
    raise exception 'Invoice does not belong to workspace';
  end if;
  v_evaluation_date := public.workspace_business_date(
    (select s.timezone from public.settings s where s.workspace_id = p_workspace_id)
  );
  if p_evaluation_date <> v_evaluation_date then
    raise exception 'Evaluation date must match workspace current date';
  end if;
  if p_rule_id is not null then
    select i.due_date::date into v_due_date from public.invoices i where i.id = p_invoice_id;
    select case r.trigger_type
      when 'before_due' then v_due_date - r.offset_days::integer
      when 'on_due' then v_due_date
      when 'after_due' then v_due_date + r.offset_days::integer
      else null end into v_scheduled_date
      from public.reminder_rules r where r.id = p_rule_id and r.workspace_id = p_workspace_id;
    if v_scheduled_date is null or p_scheduled_date > v_evaluation_date then
      raise exception 'Scheduled date must match workspace rule occurrence';
    end if;
    if p_scheduled_date is distinct from v_scheduled_date then
      -- Match findFinalAfterDueRule: offset, sort order, creation time, id descending.
      select r.id into v_final_rule_id
        from public.reminder_rules r
        join public.reminder_templates t on t.id = r.template_id and t.workspace_id = r.workspace_id
        where r.workspace_id = p_workspace_id and r.is_enabled = true
          -- isUsableReminderTemplate disables only explicit false; NULL is usable.
          and t.is_enabled is distinct from false and r.trigger_type = 'after_due'
        order by coalesce(r.offset_days, 0) desc, r.sort_order desc nulls last,
          r.created_at desc nulls last, r.id desc limit 1;
      if p_rule_id is distinct from v_final_rule_id
        or p_scheduled_date <= v_scheduled_date
        or (p_scheduled_date - v_scheduled_date) % 7 <> 0
        or p_scheduled_date > v_evaluation_date then
        raise exception 'Scheduled date must match workspace rule occurrence';
      end if;
    end if;
  elsif p_source = 'auto_cron' then
    raise exception 'Automatic delivery requires a rule occurrence';
  end if;
  -- Serialize all senders for an invoice, even across different rule/day keys.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_invoice_id::text, 0));
  if exists (
    select 1 from public.reminder_delivery_claims c
    where c.workspace_id = p_workspace_id and c.invoice_id = p_invoice_id
      and ((c.evaluation_date = p_evaluation_date and (p_source = 'manual' or c.source = 'manual'))
        or (p_rule_id is not null and c.rule_id = p_rule_id and c.scheduled_date = p_scheduled_date))
  ) then return false; end if;
  insert into public.reminder_delivery_claims(workspace_id, invoice_id, rule_id, scheduled_date, evaluation_date, source)
    values (p_workspace_id, p_invoice_id, p_rule_id, p_scheduled_date, p_evaluation_date, p_source);
  return true;
end $$;
revoke all on function public.claim_reminder_delivery(uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function public.claim_reminder_delivery(uuid, uuid, uuid, date, date, text) to authenticated, service_role;
