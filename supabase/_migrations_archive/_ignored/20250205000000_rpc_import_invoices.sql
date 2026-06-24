-- ============================================================================
-- RPC Function: rpc_import_invoices
-- ============================================================================
-- Input: p_workspace_id uuid, p_rows jsonb
-- p_rows: flat rows (one row per item) repeated header fields, grouped by invoice_number
-- Returns: jsonb array of per-invoice results
-- ============================================================================

-- Unique index (required for ON CONFLICT)
create unique index if not exists invoices_workspace_invoice_number_unique
on public.invoices (workspace_id, invoice_number)
where archived_at is null;

create or replace function public.rpc_import_invoices(
  p_workspace_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_results jsonb := '[]'::jsonb;

  v_invoice_number text;
  v_group jsonb;

  v_client_id uuid;
  v_invoice_id uuid;

  v_issue_date date;
  v_due_date date;
  v_currency text;
  v_base_status text;
  v_notes text;
  v_po_number text;

  v_total numeric;
  v_err text;

  r jsonb;
  item jsonb;

  v_item_desc text;
  v_qty numeric;
  v_unit_price numeric;
begin
  -- Group rows by invoice_number
  for v_invoice_number, v_group in
    select
      (x->>'invoice_number') as invoice_number,
      jsonb_agg(x) as grp
    from jsonb_array_elements(p_rows) as x
    where coalesce(nullif(trim(x->>'invoice_number'),''), '') <> ''
    group by (x->>'invoice_number')
  loop
    v_err := null;
    v_invoice_id := null;

    begin
      r := (select v_group->0);

      v_issue_date := (r->>'issue_date')::date;
      v_due_date := nullif(trim(r->>'due_date'),'')::date;
      v_currency := nullif(trim(r->>'currency'),'');
      v_base_status := lower(coalesce(nullif(trim(r->>'status'),''), 'sent'));
      v_notes := nullif(trim(r->>'notes'),'');
      v_po_number := nullif(trim(r->>'po_number'),'');

      -- Base statuses only (derived statuses are system-calculated)
      if v_base_status not in ('draft','sent','void') then
        v_base_status := 'sent';
      end if;

      -- Resolve client: email first, else name
      v_client_id := null;

      if nullif(trim(r->>'client_email'),'') is not null then
        select c.id into v_client_id
        from public.clients c
        where c.workspace_id = p_workspace_id
          and c.archived_at is null
          and c.email is not null
          and lower(c.email) = lower(trim(r->>'client_email'))
        limit 1;
      end if;

      if v_client_id is null and nullif(trim(r->>'client_name'),'') is not null then
        select c.id into v_client_id
        from public.clients c
        where c.workspace_id = p_workspace_id
          and c.archived_at is null
          and c.name is not null
          and lower(c.name) = lower(trim(r->>'client_name'))
        limit 1;
      end if;

      if v_client_id is null then
        v_err := 'Client not found (email/name). Import clients first or fix client_email/client_name.';
      end if;

      -- Compute total from items
      if v_err is null then
        v_total := 0;

        for item in select * from jsonb_array_elements(v_group)
        loop
          v_qty := coalesce(nullif(item->>'qty','')::numeric, 0);
          v_unit_price := coalesce(nullif(item->>'unit_price','')::numeric, 0);
          v_total := v_total + (v_qty * v_unit_price);
        end loop;

        if v_total <= 0 then
          v_err := 'Invoice total is 0. Check qty/unit_price.';
        end if;
      end if;

      if v_err is null then
        -- Upsert invoice
        insert into public.invoices (
          workspace_id,
          client_id,
          invoice_number,
          issue_date,
          due_date,
          currency,
          status,
          amount,
          po_number,
          notes,
          archived_at
        )
        values (
          p_workspace_id,
          v_client_id,
          v_invoice_number,
          v_issue_date,
          v_due_date,
          v_currency,
          v_base_status,
          v_total,
          v_po_number,
          v_notes,
          null
        )
        on conflict (workspace_id, invoice_number)
        do update set
          client_id = excluded.client_id,
          issue_date = excluded.issue_date,
          due_date = excluded.due_date,
          currency = excluded.currency,
          status = excluded.status,
          amount = excluded.amount,
          po_number = excluded.po_number,
          notes = excluded.notes,
          updated_at = now()
        returning id into v_invoice_id;

        -- Replace items (MVP simple + deterministic)
        delete from public.invoice_items
        where invoice_id = v_invoice_id;

        for item in select * from jsonb_array_elements(v_group)
        loop
          v_item_desc := nullif(trim(item->>'item_description'),'');
          v_qty := coalesce(nullif(item->>'qty','')::numeric, 0);
          v_unit_price := coalesce(nullif(item->>'unit_price','')::numeric, 0);

          if v_item_desc is null then
            v_item_desc := 'Item';
          end if;

          insert into public.invoice_items (
            invoice_id,
            description,
            quantity,
            unit_price,
            total
          )
          values (
            v_invoice_id,
            v_item_desc,
            v_qty,
            v_unit_price,
            (v_qty * v_unit_price)
          );
        end loop;
      end if;

    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is null then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'invoice_number', v_invoice_number,
          'status', 'ok',
          'action', 'upsert',
          'invoice_id', v_invoice_id,
          'error', null
        )
      );
    else
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'invoice_number', v_invoice_number,
          'status', 'failed',
          'action', 'fail',
          'invoice_id', null,
          'error', v_err
        )
      );
    end if;
  end loop;

  return v_results;
end;
$$;

grant execute on function public.rpc_import_invoices(uuid, jsonb) to anon, authenticated, service_role;
