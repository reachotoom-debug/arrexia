-- ============================================================================
-- Fix: payments.net_amount is GENERATED ALWAYS; rpc_import_payments must NOT reference it
-- ============================================================================
-- 
-- This migration creates/updates the RPC function to:
-- - NEVER insert net_amount (generated always column)
-- - Return JSONB array directly (consistent format)
-- - Handle organization_id if column exists
-- ============================================================================

create or replace function public.rpc_import_payments(
  p_workspace_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_org_id boolean;
  v_org_id uuid;

  v_row jsonb;
  v_idx int := 0;

  v_invoice_id uuid;
  v_payment_id uuid;

  v_results jsonb := '[]'::jsonb;

  v_invoice_number text;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_provider text;
  v_status text;
  v_transaction_id text;
  v_payment_date date;
  v_created_at timestamptz;
  v_archived_at timestamptz;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_array(jsonb_build_object(
      'row', 0,
      'status', 'FAILED',
      'payment_id', null,
      'error', 'p_rows must be a JSON array'
    ));
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='payments' and column_name='organization_id'
  ) into v_has_org_id;

  if v_has_org_id then
    select organization_id into v_org_id
    from workspaces
    where id = p_workspace_id
    limit 1;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;

    v_invoice_number := nullif(trim(coalesce(v_row->>'invoice_number','')), '');
    v_amount := nullif(coalesce(v_row->>'amount',''), '')::numeric;
    v_currency := nullif(trim(coalesce(v_row->>'currency','')), '');
    v_method := nullif(trim(coalesce(v_row->>'method','')), '');
    v_provider := nullif(trim(coalesce(v_row->>'payment_provider','')), '');
    v_status := lower(nullif(trim(coalesce(v_row->>'status','')), ''));
    v_transaction_id := nullif(trim(coalesce(v_row->>'transaction_id','')), '');
    v_payment_date := nullif(coalesce(v_row->>'payment_date',''), '')::date;
    v_created_at := nullif(coalesce(v_row->>'created_at',''), '')::timestamptz;
    v_archived_at := nullif(coalesce(v_row->>'archived_at',''), '')::timestamptz;

    if v_invoice_number is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_idx, 'status','FAILED','payment_id',null,'error','Missing invoice_number'
      ));
      continue;
    end if;

    if v_payment_date is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_idx, 'status','FAILED','payment_id',null,'error','Missing payment_date'
      ));
      continue;
    end if;

    if v_amount is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_idx, 'status','FAILED','payment_id',null,'error','Missing amount'
      ));
      continue;
    end if;

    select i.id into v_invoice_id
    from invoices i
    where i.workspace_id = p_workspace_id
      and i.invoice_number = v_invoice_number
      and i.archived_at is null
    limit 1;

    if v_invoice_id is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_idx, 'status','FAILED','payment_id',null,
        'error', format('Invoice not found: %s', v_invoice_number)
      ));
      continue;
    end if;

    -- IMPORTANT:
    -- DO NOT include net_amount in insert column list (generated ALWAYS).
    if v_has_org_id then
      insert into payments (
        workspace_id, organization_id, invoice_id,
        payment_date, amount, currency, method, payment_provider, status,
        transaction_id, created_at, archived_at
      ) values (
        p_workspace_id, v_org_id, v_invoice_id,
        v_payment_date, v_amount,
        coalesce(v_currency,'USD'),
        v_method, v_provider,
        coalesce(nullif(v_status,''),'completed'),
        v_transaction_id,
        coalesce(v_created_at, now()),
        v_archived_at
      )
      returning id into v_payment_id;
    else
      insert into payments (
        workspace_id, invoice_id,
        payment_date, amount, currency, method, payment_provider, status,
        transaction_id, created_at, archived_at
      ) values (
        p_workspace_id, v_invoice_id,
        v_payment_date, v_amount,
        coalesce(v_currency,'USD'),
        v_method, v_provider,
        coalesce(nullif(v_status,''),'completed'),
        v_transaction_id,
        coalesce(v_created_at, now()),
        v_archived_at
      )
      returning id into v_payment_id;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'row', v_idx,
      'status', 'INSERTED',
      'payment_id', v_payment_id,
      'error', null
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.rpc_import_payments(uuid, jsonb) from public;
grant execute on function public.rpc_import_payments(uuid, jsonb) to authenticated;

