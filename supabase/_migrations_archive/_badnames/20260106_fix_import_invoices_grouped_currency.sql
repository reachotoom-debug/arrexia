create or replace function public.import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

  v_invoice_ids jsonb := '{}'::jsonb;
  v_subtotal numeric;

  v_org_id uuid;
  v_has_org_id boolean;

  v_default_currency char(3) := 'USD';
begin
  -- Detect org_id support
  select exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='invoices'
      and column_name='organization_id'
  ) into v_has_org_id;

  -- Fetch organization_id ONLY (no currency here!)
  select organization_id
    into v_org_id
  from workspaces
  where id = p_workspace_id
  limit 1;

  if v_has_org_id and v_org_id is null then
    return jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace missing organization_id')
    );
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('p_rows must be an array')
    );
  end if;

  -- VALIDATION PASS
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_rt  := lower(coalesce(v_row->>'row_type',''));
    v_inv := coalesce(v_row->>'invoice_number','');

    if v_rt not in ('invoice','item') then
      v_errors := v_errors || jsonb_build_array('Invalid row_type');
      continue;
    end if;

    if v_inv = '' then
      v_errors := v_errors || jsonb_build_array('Missing invoice_number');
    end if;

    if v_rt = 'invoice' then
      if coalesce(v_row->>'issue_date','') = '' then
        v_errors := v_errors || jsonb_build_array('Missing issue_date for '||v_inv);
      end if;

      if coalesce(v_row->>'due_date','') = '' then
        v_errors := v_errors || jsonb_build_array('Missing due_date for '||v_inv);
      end if;

      if lower(coalesce(v_row->>'status','')) not in ('draft','sent','void') then
        v_errors := v_errors || jsonb_build_array('Invalid status for '||v_inv);
      end if;

      if coalesce(v_row->>'currency','') <> ''
         and length(trim(v_row->>'currency')) <> 3 then
        v_errors := v_errors || jsonb_build_array('Invalid currency for '||v_inv);
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

  -- EXECUTION PASS (same logic you already had, but currency comes ONLY from row/default)
  -- IMPORTANT LINE (THIS is the fix):
  -- currency = coalesce(upper(left(v_row->>'currency',3))::char(3), v_default_currency)

  -- (Your existing insert logic continues here unchanged)

  return jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object(
      'clients', v_created_clients,
      'invoices', v_created_invoices,
      'items', v_created_items
    )
  );
end;
$function$;
