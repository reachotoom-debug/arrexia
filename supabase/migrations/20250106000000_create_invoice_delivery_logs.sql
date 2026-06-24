do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoices'
  ) then

    create table if not exists public.invoice_delivery_logs (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      invoice_id uuid not null references public.invoices(id) on delete cascade,
      recipient_email text not null,
      subject text not null,
      body_preview text,
      provider_message_id text,
      status text not null check (status in ('sent', 'failed')),
      error_message text,
      created_at timestamptz not null default now()
    );

    create index if not exists invoice_delivery_logs_workspace_id_idx
      on public.invoice_delivery_logs(workspace_id);

    create index if not exists invoice_delivery_logs_invoice_id_idx
      on public.invoice_delivery_logs(invoice_id);

  else
    raise notice 'Skipping invoice_delivery_logs creation: public.invoices does not exist yet.';
  end if;
end $$;
