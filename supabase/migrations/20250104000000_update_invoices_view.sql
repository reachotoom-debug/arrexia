do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'invoices'
  ) then
    execute $view$
      create or replace view public.invoices_view as
      with invoice_base as (
        select
          i.id,
          i.workspace_id,
          i.client_id,
          i.invoice_number,
          i.issue_date,
          i.due_date,
          i.status as base_status,  -- 'draft' | 'sent' | 'void'
          i.amount as total_amount,
          coalesce(i.total_paid, 0) as paid_amount,
          (i.amount - coalesce(i.total_paid, 0)) as outstanding,
          case
            when i.due_date is null then 0
            when i.due_date < current_date then greatest(0, (current_date - i.due_date))
            else 0
          end as overdue_days
        from public.invoices i
      )
      select
        id,
        workspace_id,
        client_id,
        invoice_number,
        issue_date,
        due_date,
        base_status,
        total_amount,
        paid_amount,
        outstanding,
        overdue_days
      from invoice_base;
    $view$;
  else
    raise notice 'Skipping invoices_view update: public.invoices does not exist yet.';
  end if;
end $$;
