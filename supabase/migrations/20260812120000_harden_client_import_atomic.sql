-- ============================================================================
-- Harden client import: atomic batch, full field persistence, identity safety
-- ============================================================================

DROP FUNCTION IF EXISTS public.internal_rpc_import_clients(uuid, jsonb);
DROP FUNCTION IF EXISTS public.internal_parse_client_import_payment_terms_days(jsonb);

CREATE OR REPLACE FUNCTION public.internal_parse_client_import_payment_terms_days(
  p_row jsonb
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $parse$
DECLARE
  v_raw jsonb;
  v_text text;
  v_digits text;
BEGIN
  IF p_row ? 'payment_terms_days' THEN
    v_raw := p_row->'payment_terms_days';
    IF v_raw IS NOT NULL AND v_raw <> 'null'::jsonb THEN
      IF jsonb_typeof(v_raw) = 'number' THEN
        RETURN (v_raw #>> '{}')::integer;
      END IF;
      v_text := NULLIF(TRIM(v_raw #>> '{}'), '');
      IF v_text IS NOT NULL THEN
        RETURN v_text::integer;
      END IF;
    END IF;
  END IF;

  IF p_row ? 'payment_terms' THEN
    v_raw := p_row->'payment_terms';
    IF v_raw IS NOT NULL AND v_raw <> 'null'::jsonb THEN
      IF jsonb_typeof(v_raw) = 'number' THEN
        RETURN (v_raw #>> '{}')::integer;
      END IF;
      v_text := NULLIF(TRIM(v_raw #>> '{}'), '');
      IF v_text IS NOT NULL THEN
        IF v_text ~ '^-?\d+$' THEN
          RETURN v_text::integer;
        END IF;
        v_digits := NULLIF(regexp_replace(v_text, '[^0-9]', '', 'g'), '');
        IF v_digits IS NOT NULL THEN
          RETURN v_digits::integer;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$parse$;

CREATE OR REPLACE FUNCTION public.internal_rpc_import_clients(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
DECLARE
  v_row jsonb;
  v_row_id text;
  v_errors jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;

  v_workspace_exists boolean;
  v_has_org_id boolean;
  v_org_id uuid;

  v_name text;
  v_email text;
  v_company text;
  v_country text;
  v_phone text;
  v_whatsapp_phone text;
  v_payment_terms_days integer;
  v_status text;
  v_is_active boolean;
  v_status_column text;
  v_archived_at timestamptz;

  v_action text;
  v_client_id uuid;
  v_email_client_id uuid;
  v_whatsapp_client_id uuid;
  v_email_archived boolean;
  v_whatsapp_archived boolean;

  v_seen_emails jsonb := '{}'::jsonb;
  v_seen_whatsapp jsonb := '{}'::jsonb;
  v_dup_email text;
  v_dup_whatsapp text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id)
  INTO v_workspace_exists;

  IF NOT v_workspace_exists THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'client_id', NULL,
      'action', 'fail',
      'error', 'Workspace not found: ' || p_workspace_id::text
    ));
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'client_id', NULL,
      'action', 'fail',
      'error', 'p_rows must be a JSON array'
    ));
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'clients'
      AND c.column_name = 'organization_id'
  ) INTO v_has_org_id;

  IF v_has_org_id THEN
    SELECT w.organization_id
    INTO v_org_id
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
    LIMIT 1;

    IF v_org_id IS NULL THEN
      SELECT c.organization_id INTO v_org_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id AND c.organization_id IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
      SELECT i.organization_id INTO v_org_id
      FROM public.invoices i
      WHERE i.workspace_id = p_workspace_id AND i.organization_id IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Validate every row (no writes)
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
    v_name := NULLIF(TRIM(v_row->>'name'), '');

    IF v_name IS NULL THEN
      v_errors := v_errors || jsonb_build_array(format('Row %s: Name is required', COALESCE(v_row_id, '?')));
      CONTINUE;
    END IF;

    v_email := NULLIF(LOWER(TRIM(v_row->>'email')), '');
    v_phone := NULLIF(TRIM(v_row->>'phone'), '');
    v_whatsapp_phone := NULLIF(
      TRIM(COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')),
      ''
    );

    IF v_email IS NOT NULL AND v_seen_emails ? v_email THEN
      v_errors := v_errors || jsonb_build_array(
        format('Row %s: Duplicate email "%s" in file', COALESCE(v_row_id, '?'), v_email)
      );
    ELSIF v_email IS NOT NULL THEN
      v_seen_emails := v_seen_emails || jsonb_build_object(v_email, 1);
    END IF;

    IF v_whatsapp_phone IS NOT NULL THEN
      IF v_seen_whatsapp ? v_whatsapp_phone THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Duplicate WhatsApp "%s" in file', COALESCE(v_row_id, '?'), v_whatsapp_phone)
        );
      ELSE
        v_seen_whatsapp := v_seen_whatsapp || jsonb_build_object(v_whatsapp_phone, 1);
      END IF;
    END IF;

    IF v_phone IS NOT NULL AND v_phone <> v_whatsapp_phone THEN
      IF v_seen_whatsapp ? v_phone THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Duplicate phone/WhatsApp "%s" in file', COALESCE(v_row_id, '?'), v_phone)
        );
      ELSE
        v_seen_whatsapp := v_seen_whatsapp || jsonb_build_object(v_phone, 1);
      END IF;
    END IF;

    v_action := LOWER(COALESCE(v_row->>'action', 'insert'));
    IF v_action NOT IN ('insert', 'update') THEN
      v_errors := v_errors || jsonb_build_array(
        format('Row %s: Invalid action "%s"', COALESCE(v_row_id, '?'), v_action)
      );
      CONTINUE;
    END IF;

    v_email_client_id := NULL;
    v_whatsapp_client_id := NULL;
    v_email_archived := false;
    v_whatsapp_archived := false;

    IF v_email IS NOT NULL THEN
      SELECT c.id, (c.archived_at IS NOT NULL)
      INTO v_email_client_id, v_email_archived
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.email IS NOT NULL
        AND LOWER(TRIM(c.email)) = v_email
      ORDER BY (c.archived_at IS NULL) DESC
      LIMIT 1;

      IF v_email_archived THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Client is archived (email: %s)', COALESCE(v_row_id, '?'), v_email)
        );
        CONTINUE;
      END IF;

      IF (
        SELECT COUNT(*)::integer
        FROM public.clients c
        WHERE c.workspace_id = p_workspace_id
          AND c.archived_at IS NULL
          AND c.email IS NOT NULL
          AND LOWER(TRIM(c.email)) = v_email
      ) > 1 THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Multiple existing clients found with email %s', COALESCE(v_row_id, '?'), v_email)
        );
        CONTINUE;
      END IF;
    END IF;

    IF v_whatsapp_phone IS NOT NULL THEN
      SELECT c.id, (c.archived_at IS NOT NULL)
      INTO v_whatsapp_client_id, v_whatsapp_archived
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND (
          c.whatsapp_phone = v_whatsapp_phone
          OR c.whatsapp = v_whatsapp_phone
        )
      LIMIT 1;

      IF v_whatsapp_client_id IS NULL THEN
        SELECT c.id, (c.archived_at IS NOT NULL)
        INTO v_whatsapp_client_id, v_whatsapp_archived
        FROM public.clients c
        WHERE c.workspace_id = p_workspace_id
          AND c.archived_at IS NOT NULL
          AND (
            c.whatsapp_phone = v_whatsapp_phone
            OR c.whatsapp = v_whatsapp_phone
          )
        LIMIT 1;
      END IF;

      IF v_whatsapp_archived THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Client is archived (WhatsApp: %s)', COALESCE(v_row_id, '?'), v_whatsapp_phone)
        );
        CONTINUE;
      END IF;
    ELSIF v_phone IS NOT NULL THEN
      SELECT c.id, (c.archived_at IS NOT NULL)
      INTO v_whatsapp_client_id, v_whatsapp_archived
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND (
          c.whatsapp_phone = v_phone
          OR c.whatsapp = v_phone
        )
      LIMIT 1;

      IF v_whatsapp_archived THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Client is archived (phone: %s)', COALESCE(v_row_id, '?'), v_phone)
        );
        CONTINUE;
      END IF;
    END IF;

    IF v_email_client_id IS NOT NULL
       AND v_whatsapp_client_id IS NOT NULL
       AND v_email_client_id <> v_whatsapp_client_id THEN
      v_errors := v_errors || jsonb_build_array(
        format(
          'Row %s: Email and WhatsApp resolve to different existing clients',
          COALESCE(v_row_id, '?')
        )
      );
      CONTINUE;
    END IF;

    IF v_action = 'update' THEN
      v_client_id := COALESCE(v_email_client_id, v_whatsapp_client_id);
      IF v_client_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(
          format('Row %s: Update requested but no matching client found', COALESCE(v_row_id, '?'))
        );
      END IF;
    ELSIF v_action = 'insert'
          AND COALESCE(v_email_client_id, v_whatsapp_client_id) IS NOT NULL THEN
      v_errors := v_errors || jsonb_build_array(
        format('Row %s: Insert requested but matching client already exists', COALESCE(v_row_id, '?'))
      );
    END IF;

    IF v_has_org_id AND v_org_id IS NULL AND v_action = 'insert' THEN
      v_errors := v_errors || jsonb_build_array(
        format('Row %s: organization_id not resolvable for workspace', COALESCE(v_row_id, '?'))
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'client_id', NULL,
      'action', 'fail',
      'error', v_errors::text
    ));
  END IF;

  IF COALESCE(p_dry_run, false) THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
    LOOP
      v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
      v_action := LOWER(COALESCE(v_row->>'action', 'insert'));
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_row_id,
        'status', 'ok',
        'client_id', NULL,
        'action', v_action,
        'name', NULLIF(TRIM(v_row->>'name'), ''),
        'email', NULLIF(LOWER(TRIM(v_row->>'email')), ''),
        'error', NULL
      ));
    END LOOP;
    RETURN v_results;
  END IF;

  -- Execute all rows (any failure rolls back entire transaction)
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
    v_name := NULLIF(TRIM(v_row->>'name'), '');
    v_email := NULLIF(LOWER(TRIM(v_row->>'email')), '');
    v_company := NULLIF(TRIM(COALESCE(v_row->>'company_name', v_row->>'company')), '');
    v_country := NULLIF(TRIM(v_row->>'country'), '');
    v_phone := NULLIF(TRIM(v_row->>'phone'), '');
    v_whatsapp_phone := NULLIF(
      TRIM(COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')),
      ''
    );
    v_action := LOWER(COALESCE(v_row->>'action', 'insert'));

    v_payment_terms_days := public.internal_parse_client_import_payment_terms_days(v_row);

    v_status := LOWER(NULLIF(TRIM(v_row->>'status'), ''));
    IF v_status IS NULL THEN
      v_is_active := true;
      v_status_column := 'active';
    ELSIF v_status = 'active' THEN
      v_is_active := true;
      v_status_column := 'active';
    ELSIF v_status IN ('inactive', 'archived') THEN
      v_is_active := false;
      v_status_column := 'archived';
    ELSE
      v_is_active := true;
      v_status_column := 'active';
    END IF;

    IF v_row->>'archived_at' IS NOT NULL AND TRIM(v_row->>'archived_at') <> '' THEN
      v_archived_at := (v_row->>'archived_at')::timestamptz;
    ELSE
      v_archived_at := NULL;
    END IF;

    v_client_id := NULL;
    IF v_email IS NOT NULL THEN
      SELECT c.id INTO v_client_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND c.email IS NOT NULL
        AND LOWER(TRIM(c.email)) = v_email
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND v_whatsapp_phone IS NOT NULL THEN
      SELECT c.id INTO v_client_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND (
          c.whatsapp_phone = v_whatsapp_phone
          OR c.whatsapp = v_whatsapp_phone
        )
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL AND v_phone IS NOT NULL THEN
      SELECT c.id INTO v_client_id
      FROM public.clients c
      WHERE c.workspace_id = p_workspace_id
        AND c.archived_at IS NULL
        AND (
          c.whatsapp_phone = v_phone
          OR c.whatsapp = v_phone
        )
      LIMIT 1;
    END IF;

    IF v_action = 'update' THEN
      IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'client_import_failed'
          USING ERRCODE = 'P0001',
                DETAIL = format('Update failed: no client for row %s', COALESCE(v_row_id, '?'));
      END IF;

      UPDATE public.clients c
      SET
        name = v_name,
        email = CASE WHEN v_email IS NOT NULL THEN v_email ELSE c.email END,
        company = CASE WHEN v_company IS NOT NULL THEN v_company ELSE c.company END,
        country = CASE WHEN v_country IS NOT NULL THEN v_country ELSE c.country END,
        whatsapp = CASE WHEN v_phone IS NOT NULL THEN v_phone ELSE c.whatsapp END,
        whatsapp_phone = CASE
          WHEN v_whatsapp_phone IS NOT NULL THEN v_whatsapp_phone
          ELSE c.whatsapp_phone
        END,
        payment_terms = CASE
          WHEN v_payment_terms_days IS NOT NULL THEN v_payment_terms_days::text
          ELSE c.payment_terms
        END,
        payment_terms_days = CASE
          WHEN v_payment_terms_days IS NOT NULL THEN v_payment_terms_days
          ELSE c.payment_terms_days
        END,
        is_active = CASE
          WHEN v_row->>'status' IS NOT NULL AND TRIM(v_row->>'status') <> '' THEN v_is_active
          ELSE c.is_active
        END,
        status = CASE
          WHEN v_row->>'status' IS NOT NULL AND TRIM(v_row->>'status') <> '' THEN v_status_column
          ELSE c.status
        END,
        archived_at = CASE
          WHEN v_row ? 'archived_at' AND TRIM(COALESCE(v_row->>'archived_at', '')) <> ''
            THEN v_archived_at
          ELSE c.archived_at
        END,
        updated_at = NOW()
      WHERE c.id = v_client_id
        AND c.workspace_id = p_workspace_id
      RETURNING c.id INTO v_client_id;

      IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'client_import_failed'
          USING ERRCODE = 'P0001',
                DETAIL = format('Update failed for row %s', COALESCE(v_row_id, '?'));
      END IF;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_row_id,
        'status', 'ok',
        'client_id', v_client_id,
        'action', 'update',
        'name', v_name,
        'email', v_email,
        'error', NULL
      ));
    ELSE
      IF v_client_id IS NOT NULL THEN
        RAISE EXCEPTION 'client_import_failed'
          USING ERRCODE = 'P0001',
                DETAIL = format('Insert failed: client already exists for row %s', COALESCE(v_row_id, '?'));
      END IF;
      IF v_has_org_id THEN
        INSERT INTO public.clients (
          workspace_id,
          organization_id,
          name,
          email,
          company,
          country,
          whatsapp,
          whatsapp_phone,
          payment_terms,
          payment_terms_days,
          is_active,
          status,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_org_id,
          v_name,
          v_email,
          v_company,
          v_country,
          v_phone,
          v_whatsapp_phone,
          COALESCE(v_payment_terms_days::text, '30'),
          COALESCE(v_payment_terms_days, 30),
          v_is_active,
          v_status_column,
          v_archived_at
        )
        RETURNING id INTO v_client_id;
      ELSE
        INSERT INTO public.clients (
          workspace_id,
          name,
          email,
          company,
          country,
          whatsapp,
          whatsapp_phone,
          payment_terms,
          payment_terms_days,
          is_active,
          status,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_name,
          v_email,
          v_company,
          v_country,
          v_phone,
          v_whatsapp_phone,
          COALESCE(v_payment_terms_days::text, '30'),
          COALESCE(v_payment_terms_days, 30),
          v_is_active,
          v_status_column,
          v_archived_at
        )
        RETURNING id INTO v_client_id;
      END IF;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_row_id,
        'status', 'ok',
        'client_id', v_client_id,
        'action', 'insert',
        'name', v_name,
        'email', v_email,
        'error', NULL
      ));
    END IF;
  END LOOP;

  RETURN v_results;
END;
$func$;

-- Wrapper: preserve entitlement preflight, pass dry_run=false for live execute
CREATE OR REPLACE FUNCTION public.rpc_import_clients(
  p_workspace_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_clients integer := 0;
BEGIN
  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) = 'array' THEN
    SELECT COUNT(*)::integer
    INTO v_new_clients
    FROM jsonb_array_elements(p_rows) elem
    WHERE LOWER(COALESCE(elem->>'action', 'insert')) = 'insert';
  END IF;

  PERFORM public.internal_import_entitlement_preflight(p_workspace_id, v_new_clients, 0);

  RETURN public.internal_rpc_import_clients(p_workspace_id, p_rows, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.internal_parse_client_import_payment_terms_days(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_parse_client_import_payment_terms_days(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_parse_client_import_payment_terms_days(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_parse_client_import_payment_terms_days(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) IS
  'Atomic client import: validate all rows, optional dry_run (zero writes), else all-or-nothing execute. Identity: email then WhatsApp/phone. Rejects archived matches. Returns [{rowId, status, client_id, action, name, email, error}].';

COMMENT ON FUNCTION public.rpc_import_clients(uuid, jsonb) IS
  'Client import RPC: net-new entitlement preflight, delegates to internal_rpc_import_clients (atomic batch).';
