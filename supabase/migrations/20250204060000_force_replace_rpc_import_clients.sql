create or replace function public.rpc_import_clients(p_workspace_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  r jsonb;

  v_has_org_id boolean;
  v_org_id uuid;

  v_row_id text;
  v_client_id uuid;

  v_name text;
  v_email text;
  v_company text;
  v_whatsapp text;
  v_status text;
  v_archived_at timestamptz;
  v_is_active boolean;

  results jsonb := '[]'::jsonb;
  result jsonb;
  err text;
begin
  -- check if clients.organization_id exists
  select exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='clients'
      and column_name='organization_id'
  ) into v_has_org_id;

  -- resolve org_id WITHOUT workspaces (workspace has no organization_id column)
  if v_has_org_id then
    select c.organization_id into v_org_id
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.organization_id is not null
    limit 1;

    if v_org_id is null then
      select i.organization_id into v_org_id
      from public.invoices i
      where i.workspace_id = p_workspace_id
        and i.organization_id is not null
      limit 1;
    end if;

    if v_org_id is null then
      select p.organization_id into v_org_id
      from public.payments p
      where p.workspace_id = p_workspace_id
        and p.organization_id is not null
      limit 1;
    end if;
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    err := null;
    v_client_id := null;

    v_row_id := coalesce(r->>'rowId', r->>'row_id', r->>'id');

    begin
      v_name := nullif(trim(r->>'name'), '');
      if v_name is null then
        err := 'Name is required';
      end if;

      v_email := nullif(trim(r->>'email'), '');
      if v_email is not null then
        v_email := lower(v_email);
      end if;

      v_company := nullif(trim(coalesce(r->>'company_name', r->>'company')), '');
      v_whatsapp := nullif(trim(coalesce(r->>'whatsapp_phone', r->>'whatsapp')), '');

      v_status := coalesce(nullif(trim(r->>'status'), ''), 'active');
      v_is_active := (lower(coalesce(v_status,'active')) = 'active');

      if r->>'archived_at' is not null and trim(r->>'archived_at') <> '' then
        begin
          v_archived_at := (r->>'archived_at')::timestamptz;
        exception when others then
          err := 'Invalid archived_at format: ' || (r->>'archived_at');
        end;
      else
        v_archived_at := null;
      end if;

      -- if org_id is required but not resolvable, fail per-row (no global raise)
      if err is null and v_has_org_id and v_org_id is null then
        err := 'organization_id not resolvable for workspace';
      end if;

      if err is null then
        -- match existing active client by email (case-insensitive)
        if v_email is not null then
          select c.id into v_client_id
          from public.clients c
          where c.workspace_id = p_workspace_id
            and c.archived_at is null
            and c.email is not null
            and lower(c.email) = v_email
          limit 1;
        end if;

        -- else match by whatsapp_phone
        if v_client_id is null and v_whatsapp is not null then
          select c.id into v_client_id
          from public.clients c
          where c.workspace_id = p_workspace_id
            and c.archived_at is null
            and c.whatsapp_phone = v_whatsapp
          limit 1;
        end if;

        if v_client_id is not null then
          update public.clients
          set
            name = v_name,
            email = coalesce(v_email, email),
            company = coalesce(v_company, company),
            whatsapp_phone = coalesce(v_whatsapp, whatsapp_phone),
            is_active = v_is_active,
            status = coalesce(v_status, status, 'active'),
            archived_at = coalesce(v_archived_at, archived_at),
            updated_at = now()
          where id = v_client_id
          returning id into v_client_id;

          result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'action', 'update',
            'client_id', v_client_id,
            'error', null
          );
        else
          if v_has_org_id then
            insert into public.clients (
              workspace_id, organization_id,
              name, email, company, whatsapp_phone,
              is_active, status, archived_at
            )
            values (
              p_workspace_id, v_org_id,
              v_name, v_email, v_company, v_whatsapp,
              v_is_active, v_status, v_archived_at
            )
            returning id into v_client_id;
          else
            insert into public.clients (
              workspace_id,
              name, email, company, whatsapp_phone,
              is_active, status, archived_at
            )
            values (
              p_workspace_id,
              v_name, v_email, v_company, v_whatsapp,
              v_is_active, v_status, v_archived_at
            )
            returning id into v_client_id;
          end if;

          result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'action', 'insert',
            'client_id', v_client_id,
            'error', null
          );
        end if;
      else
        result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'action', 'fail',
          'client_id', null,
          'error', err
        );
      end if;

    exception when others then
      result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'failed',
        'action', 'fail',
        'client_id', null,
        'error', sqlerrm
      );
    end;

    results := results || jsonb_build_array(result);
  end loop;

  return results;
end;
$$;
