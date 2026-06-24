-- 20260103_import_invoices_grouped.sql

create or replace function public.import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_errors jsonb := '[]'::jsonb;

  v_created_clients int := 0;
  v_created_invoices int := 0;
  v_created_items int := 0;

  v_row jsonb;
  v_rt text;
  v_inv text;

  v_client_id uuid;
  v_invoice_id uuid;

  v_invoice_ids jsonb := '{}'::jsonb; -- invoice_number -> invoice_id
  v_subtotal numeric;
  
  -- Multi-tenant: organization_id from workspace
  v_org_id uuid;
  v_has_org_id boolean;
begin
  -- Guard: workspace_id must be present
  if p_workspace_id is null then
    return jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('workspace_id is required'),
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  end if;

  -- Fetch organization_id from workspace (DO NOT reference workspaces.currency)
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'organization_id'
  ) into v_has_org_id;
  
  -- Fetch workspace organization_id
  select organization_id into v_org_id
  from workspaces
  where id = p_workspace_id
  limit 1;
  
  -- Guard: if organization_id column exists, workspace must have organization_id
  if v_has_org_id and v_org_id is null then
    return jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace is missing organization_id. Please contact support to configure your workspace.')
    );
  end if;
  -- shape check
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('p_rows must be a JSON array'));
  end if;

  -- validate
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_rt := lower(coalesce(v_row->>'row_type',''));
    v_inv := coalesce(v_row->>'invoice_number','');

    if v_rt not in ('invoice','item') then
      v_errors := v_errors || jsonb_build_array(format('Invalid row_type "%s" (invoice_number=%s)', v_rt, v_inv));
      continue;
    end if;

    if v_inv = '' then
      v_errors := v_errors || jsonb_build_array('Missing invoice_number');
      continue;
    end if;

    if v_rt = 'invoice' then
      if coalesce(v_row->>'issue_date','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing issue_date for %s', v_inv));
      end if;
      if coalesce(v_row->>'due_date','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing due_date for %s', v_inv));
      end if;
      -- Currency validation: must be 3-letter ISO code (A-Z only) if provided, default to USD if blank
      if coalesce(v_row->>'currency','') <> '' then
        declare
          v_currency text := upper(trim(coalesce(v_row->>'currency','')));
        begin
          if length(v_currency) <> 3 or v_currency !~ '^[A-Z]{3}$' then
            v_errors := v_errors || jsonb_build_array(format('Invalid currency "%s" for %s (must be a 3-letter ISO code like USD, EUR, etc.)', v_row->>'currency', v_inv));
          end if;
        end;
      end if;

      if lower(coalesce(v_row->>'status','')) not in ('draft','sent','void') then
        v_errors := v_errors || jsonb_build_array(format('Invalid status "%s" for %s (allowed Draft/Sent/Void)', coalesce(v_row->>'status',''), v_inv));
      end if;

      if coalesce(v_row->>'client_email','') = '' and coalesce(v_row->>'client_name','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing client_email or client_name for %s', v_inv));
      end if;
    end if;

    if v_rt = 'item' then
      if coalesce(v_row->>'item_description','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing item_description for %s', v_inv));
      end if;
      if coalesce(v_row->>'quantity','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing quantity for %s', v_inv));
      end if;
      if coalesce(v_row->>'unit_price','') = '' then
        v_errors := v_errors || jsonb_build_array(format('Missing unit_price for %s', v_inv));
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true,
      'errors', '[]'::jsonb,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  end if;

  -- execute: invoices + clients
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if lower(coalesce(v_row->>'row_type','')) <> 'invoice' then
      continue;
    end if;

    v_inv := coalesce(v_row->>'invoice_number','');
    v_client_id := null;

    -- match client by email then name
    if coalesce(v_row->>'client_email','') <> '' then
      select id into v_client_id
      from clients
      where workspace_id = p_workspace_id
        and lower(email) = lower(v_row->>'client_email')
      limit 1;
    end if;

    if v_client_id is null and coalesce(v_row->>'client_name','') <> '' then
      select id into v_client_id
      from clients
      where workspace_id = p_workspace_id
        and name = (v_row->>'client_name')
      limit 1;
    end if;

    if v_client_id is null then
      -- Insert client with organization_id if column exists (always include if column exists)
      if v_has_org_id then
        insert into clients (workspace_id, organization_id, name, email, is_active, archived_at)
        values (p_workspace_id, v_org_id, nullif(v_row->>'client_name',''), nullif(v_row->>'client_email',''), true, null)
        returning id into v_client_id;
      else
        insert into clients (workspace_id, name, email, is_active, archived_at)
        values (p_workspace_id, nullif(v_row->>'client_name',''), nullif(v_row->>'client_email',''), true, null)
        returning id into v_client_id;
      end if;

      v_created_clients := v_created_clients + 1;
    end if;

    -- Insert invoice with organization_id if column exists (always include if column exists)
    -- Note: amount will be computed from items after insert
    -- REMOVED: total_paid, outstanding_amount, payment_state (computed by invoices_view)
    if v_has_org_id then
      insert into invoices (
        workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount
      )
      values (
        p_workspace_id, v_org_id, v_client_id, v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        coalesce(nullif(upper(trim(v_row->>'currency')), ''), 'USD'),
        lower(trim(v_row->>'status')), -- Store as lowercase: draft/sent/void
        nullif(v_row->>'po_number',''),
        nullif(v_row->>'notes',''),
        0 -- Will be computed from items after insert
      )
      returning id into v_invoice_id;
    else
      insert into invoices (
        workspace_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount
      )
      values (
        p_workspace_id, v_client_id, v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        coalesce(nullif(upper(trim(v_row->>'currency')), ''), 'USD'),
        lower(trim(v_row->>'status')), -- Store as lowercase: draft/sent/void
        nullif(v_row->>'po_number',''),
        nullif(v_row->>'notes',''),
        0 -- Will be computed from items after insert
      )
      returning id into v_invoice_id;
    end if;

    v_invoice_ids := jsonb_set(v_invoice_ids, array[v_inv], to_jsonb(v_invoice_id), true);
    v_created_invoices := v_created_invoices + 1;
  end loop;

  -- items
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if lower(coalesce(v_row->>'row_type','')) <> 'item' then
      continue;
    end if;

    v_inv := coalesce(v_row->>'invoice_number','');
    v_invoice_id := (v_invoice_ids ->> v_inv)::uuid;

    -- Insert invoice_item with organization_id if column exists (always include if column exists)
    if v_has_org_id then
      insert into invoice_items (organization_id, invoice_id, name, description, quantity, unit_price, position)
      values (
        v_org_id,
        v_invoice_id,
        v_row->>'item_description',
        null,
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        1
      );
    else
      insert into invoice_items (invoice_id, name, description, quantity, unit_price, position)
      values (
        v_invoice_id,
        v_row->>'item_description',
        null,
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        1
      );
    end if;

    v_created_items := v_created_items + 1;
  end loop;

  -- totals from items
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if lower(coalesce(v_row->>'row_type','')) <> 'invoice' then
      continue;
    end if;

    v_inv := coalesce(v_row->>'invoice_number','');
    v_invoice_id := (v_invoice_ids ->> v_inv)::uuid;

    -- Compute total from items (quantity * unit_price)
    select coalesce(sum(quantity * unit_price), 0)
      into v_subtotal
    from invoice_items
    where invoice_id = v_invoice_id;

    -- Update invoice with computed totals (amount = sum of items)
    -- REMOVED: outstanding_amount, total_paid, payment_state (computed by invoices_view)
    update invoices
    set amount = v_subtotal
    where id = v_invoice_id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
end;
$func$;

grant execute on function public.import_invoices_grouped(uuid, jsonb, boolean) to anon, authenticated, service_role;
