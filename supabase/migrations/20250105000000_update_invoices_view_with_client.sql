do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'invoices'
  )
  and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    execute $view$
      -- 20250105000000_update_invoices_view_with_client.sql

      -- Drop existing view to avoid column rename errors
      DROP VIEW IF EXISTS public.invoices_view;

      -- Create view with explicit column order
      CREATE VIEW public.invoices_view AS
      WITH invoice_calculations AS (
        SELECT
          i.id,
          i.workspace_id,
          i.client_id,
          i.invoice_number,
          c.name AS client_name,
          i.status AS base_status,              -- 'draft' | 'sent' | 'void'
          i.amount AS total_amount,
          COALESCE(i.total_paid, 0) AS paid_amount,
          (i.amount - COALESCE(i.total_paid, 0)) AS outstanding,
          i.issue_date,
          i.due_date,
          CASE
            WHEN i.due_date IS NULL THEN 0
            WHEN i.due_date < CURRENT_DATE THEN GREATEST(0, (CURRENT_DATE - i.due_date))
            ELSE 0
          END AS overdue_days
        FROM public.invoices i
        JOIN public.clients c ON c.id = i.client_id
      )
      SELECT
        id,
        workspace_id,
        client_id,
        invoice_number,
        client_name,
        base_status,
        total_amount,
        paid_amount,
        outstanding,
        issue_date,
        due_date,
        overdue_days
      FROM invoice_calculations;
    $view$;
  else
    raise notice 'Skipping invoices_view update with client: required tables not present yet.';
  end if;
end $$;
