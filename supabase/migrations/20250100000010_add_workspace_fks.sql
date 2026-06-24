-- Add missing workspace_id FKs safely (only if table exists)
-- Works in fresh DB and existing DB.

do $$
begin
  if to_regclass('public.workspace_email_settings') is not null then
    begin
      alter table public.workspace_email_settings
        add constraint workspace_email_settings_workspace_id_fkey
        foreign key (workspace_id) references public.workspaces(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.reminder_templates') is not null then
    begin
      alter table public.reminder_templates
        add constraint reminder_templates_workspace_id_fkey
        foreign key (workspace_id) references public.workspaces(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.reminder_rules') is not null then
    begin
      alter table public.reminder_rules
        add constraint reminder_rules_workspace_id_fkey
        foreign key (workspace_id) references public.workspaces(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
