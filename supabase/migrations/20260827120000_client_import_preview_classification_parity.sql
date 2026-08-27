-- ============================================================================
-- Client import preview/execution classification parity
-- ============================================================================
-- Makes internal_rpc_import_clients the single authoritative classifier for
-- INSERT vs UPDATE vs FAIL. Dry-run returns computed actions (zero writes).
-- Adds canonical phone normalization for CSV + DB identity matching.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_canonical_client_import_email(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(LOWER(BTRIM(p_raw)), '');
$$;

CREATE OR REPLACE FUNCTION public.internal_canonical_client_import_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $phone$
DECLARE
  v_trimmed text;
  v_digits text;
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;

  v_trimmed := BTRIM(p_raw);
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  v_digits := NULLIF(regexp_replace(v_trimmed, '[^0-9]', '', 'g'), '');

  IF v_digits IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_digits;
END;
$phone$;

CREATE OR REPLACE FUNCTION public.internal_client_import_phone_keys_match(
  p_stored text,
  p_canonical text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_canonical IS NOT NULL
    AND p_canonical <> ''
    AND public.internal_canonical_client_import_phone(p_stored) = p_canonical;
$$;

-- Authoritative workspace-scoped identity resolution for one import row.
-- Returns jsonb: { action: insert|update|fail, client_id: uuid|null, error: text|null }
CREATE OR REPLACE FUNCTION public.internal_resolve_client_import_identity(
  p_workspace_id uuid,
  p_email text,
  p_phone text,
  p_whatsapp text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $resolve$
DECLARE
  v_email text := public.internal_canonical_client_import_email(p_email);
  v_whatsapp text := public.internal_canonical_client_import_phone(p_whatsapp);
  v_phone text := public.internal_canonical_client_import_phone(p_phone);

  v_email_client_id uuid;
  v_email_archived boolean := false;
  v_whatsapp_client_id uuid;
  v_whatsapp_archived boolean := false;
  v_active_email_count integer := 0;
  v_key text;
  v_candidate_id uuid;
  v_candidate_archived boolean;
BEGIN
  IF v_email IS NOT NULL THEN
    SELECT c.id, (c.archived_at IS NOT NULL)
    INTO v_email_client_id, v_email_archived
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id
      AND c.email IS NOT NULL
      AND public.internal_canonical_client_import_email(c.email) = v_email
    ORDER BY (c.archived_at IS NULL) DESC, c.created_at ASC
    LIMIT 1;

    IF v_email_archived THEN
      RETURN jsonb_build_object(
        'action', 'fail',
        'client_id', NULL,
        'error', format('Client is archived (email: %s)', v_email)
      );
    END IF;

    SELECT COUNT(*)::integer
    INTO v_active_email_count
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id
      AND c.archived_at IS NULL
      AND c.email IS NOT NULL
      AND public.internal_canonical_client_import_email(c.email) = v_email;

    IF v_active_email_count > 1 THEN
      RETURN jsonb_build_object(
        'action', 'fail',
        'client_id', NULL,
        'error', format('Multiple existing clients found with email %s', v_email)
      );
    END IF;
  END IF;

  FOR v_key IN
    SELECT DISTINCT k.key
    FROM (
      SELECT v_whatsapp AS key
      UNION
      SELECT v_phone AS key
    ) k
    WHERE k.key IS NOT NULL AND k.key <> ''
  LOOP
    v_candidate_id := NULL;
    v_candidate_archived := false;

    SELECT c.id, (c.archived_at IS NOT NULL)
    INTO v_candidate_id, v_candidate_archived
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id
      AND (
        public.internal_client_import_phone_keys_match(c.whatsapp_phone, v_key)
        OR public.internal_client_import_phone_keys_match(c.whatsapp, v_key)
      )
    ORDER BY (c.archived_at IS NULL) DESC, c.created_at ASC
    LIMIT 1;

    IF v_candidate_archived THEN
      RETURN jsonb_build_object(
        'action', 'fail',
        'client_id', NULL,
        'error', format('Client is archived (WhatsApp: %s)', v_key)
      );
    END IF;

    IF v_candidate_id IS NOT NULL THEN
      IF v_whatsapp_client_id IS NULL THEN
        v_whatsapp_client_id := v_candidate_id;
      ELSIF v_whatsapp_client_id <> v_candidate_id THEN
        RETURN jsonb_build_object(
          'action', 'fail',
          'client_id', NULL,
          'error', 'WhatsApp matches multiple existing clients; clean up first'
        );
      END IF;
    END IF;
  END LOOP;

  IF v_email_client_id IS NOT NULL
     AND v_whatsapp_client_id IS NOT NULL
     AND v_email_client_id <> v_whatsapp_client_id THEN
    RETURN jsonb_build_object(
      'action', 'fail',
      'client_id', NULL,
      'error', 'Email and WhatsApp resolve to different existing clients; use a single identity key'
    );
  END IF;

  IF COALESCE(v_email_client_id, v_whatsapp_client_id) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'update',
      'client_id', COALESCE(v_email_client_id, v_whatsapp_client_id),
      'error', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'action', 'insert',
    'client_id', NULL,
    'error', NULL
  );
END;
$resolve$;

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

  v_input_action text;
  v_resolved jsonb;
  v_resolved_action text;
  v_client_id uuid;
  v_row_error text;

  v_seen_emails jsonb := '{}'::jsonb;
  v_seen_whatsapp jsonb := '{}'::jsonb;
  v_canonical_wa text;
  v_canonical_phone text;
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

  -- Pass 1: validate + classify every row (no writes)
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
    v_name := NULLIF(BTRIM(v_row->>'name'), '');
    v_row_error := NULL;

    IF v_name IS NULL THEN
      v_row_error := format('Row %s: Name is required', COALESCE(v_row_id, '?'));
    END IF;

    v_email := public.internal_canonical_client_import_email(v_row->>'email');
    v_phone := public.internal_canonical_client_import_phone(v_row->>'phone');
    v_canonical_wa := public.internal_canonical_client_import_phone(
      COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')
    );
    v_whatsapp_phone := v_canonical_wa;

    IF v_row_error IS NULL AND v_email IS NOT NULL AND v_seen_emails ? v_email THEN
      v_row_error := format('Row %s: Duplicate email "%s" in file', COALESCE(v_row_id, '?'), v_email);
    ELSIF v_row_error IS NULL AND v_email IS NOT NULL THEN
      v_seen_emails := v_seen_emails || jsonb_build_object(v_email, 1);
    END IF;

    IF v_row_error IS NULL AND v_canonical_wa IS NOT NULL THEN
      IF v_seen_whatsapp ? v_canonical_wa THEN
        v_row_error := format('Row %s: Duplicate WhatsApp "%s" in file', COALESCE(v_row_id, '?'), v_canonical_wa);
      ELSE
        v_seen_whatsapp := v_seen_whatsapp || jsonb_build_object(v_canonical_wa, 1);
      END IF;
    END IF;

    IF v_row_error IS NULL AND v_phone IS NOT NULL AND v_phone IS DISTINCT FROM v_canonical_wa THEN
      IF v_seen_whatsapp ? v_phone THEN
        v_row_error := format('Row %s: Duplicate phone/WhatsApp "%s" in file', COALESCE(v_row_id, '?'), v_phone);
      ELSE
        v_seen_whatsapp := v_seen_whatsapp || jsonb_build_object(v_phone, 1);
      END IF;
    END IF;

    v_resolved := NULL;
    v_resolved_action := NULL;
    v_client_id := NULL;

    IF v_row_error IS NULL THEN
      v_resolved := public.internal_resolve_client_import_identity(
        p_workspace_id,
        v_row->>'email',
        v_row->>'phone',
        COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')
      );
      v_resolved_action := v_resolved->>'action';
      v_row_error := NULLIF(v_resolved->>'error', '');
      IF v_resolved_action IN ('insert', 'update') THEN
        v_client_id := NULLIF(v_resolved->>'client_id', '')::uuid;
      END IF;
    END IF;

    IF v_row_error IS NOT NULL THEN
      v_resolved_action := 'fail';
    ELSIF v_resolved_action IS NULL OR v_resolved_action NOT IN ('insert', 'update', 'fail') THEN
      v_resolved_action := 'fail';
      v_row_error := format('Row %s: Unable to classify import action', COALESCE(v_row_id, '?'));
    END IF;

    v_input_action := LOWER(COALESCE(v_row->>'action', v_resolved_action));

    IF NOT COALESCE(p_dry_run, false)
       AND v_row_error IS NULL
       AND v_input_action IN ('insert', 'update')
       AND v_input_action <> v_resolved_action THEN
      v_row_error := format(
        'Row %s: Preview action "%s" does not match authoritative action "%s"',
        COALESCE(v_row_id, '?'),
        v_input_action,
        v_resolved_action
      );
      v_resolved_action := 'fail';
    END IF;

    IF NOT COALESCE(p_dry_run, false)
       AND v_row_error IS NULL
       AND v_resolved_action = 'insert'
       AND v_client_id IS NOT NULL THEN
      v_row_error := format(
        'Row %s: Insert requested but matching client already exists',
        COALESCE(v_row_id, '?')
      );
      v_resolved_action := 'fail';
    END IF;

    IF NOT COALESCE(p_dry_run, false)
       AND v_row_error IS NULL
       AND v_resolved_action = 'update'
       AND v_client_id IS NULL THEN
      v_row_error := format(
        'Row %s: Update requested but no matching client found',
        COALESCE(v_row_id, '?')
      );
      v_resolved_action := 'fail';
    END IF;

    IF NOT COALESCE(p_dry_run, false)
       AND v_row_error IS NULL
       AND v_resolved_action = 'insert'
       AND v_has_org_id
       AND v_org_id IS NULL THEN
      v_row_error := format(
        'Row %s: organization_id not resolvable for workspace',
        COALESCE(v_row_id, '?')
      );
      v_resolved_action := 'fail';
    END IF;

    IF COALESCE(p_dry_run, false) THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowId', v_row_id,
        'status', CASE WHEN v_resolved_action = 'fail' THEN 'failed' ELSE 'ok' END,
        'client_id', v_client_id,
        'action', v_resolved_action,
        'name', v_name,
        'email', v_email,
        'error', v_row_error
      ));
    ELSIF v_row_error IS NOT NULL THEN
      v_errors := v_errors || jsonb_build_array(
        format('Row %s: %s', COALESCE(v_row_id, '?'), v_row_error)
      );
    END IF;
  END LOOP;

  IF COALESCE(p_dry_run, false) THEN
    RETURN v_results;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'rowId', '0',
      'status', 'failed',
      'client_id', NULL,
      'action', 'fail',
      'error', v_errors::text
    ));
  END IF;

  -- Execute all rows (any failure rolls back entire transaction)
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_row_id := COALESCE(v_row->>'rowId', v_row->>'row_id', v_row->>'id');
    v_name := NULLIF(BTRIM(v_row->>'name'), '');
    v_email := public.internal_canonical_client_import_email(v_row->>'email');
    v_company := NULLIF(BTRIM(COALESCE(v_row->>'company_name', v_row->>'company')), '');
    v_country := NULLIF(BTRIM(v_row->>'country'), '');
    v_phone := public.internal_canonical_client_import_phone(v_row->>'phone');
    v_whatsapp_phone := public.internal_canonical_client_import_phone(
      COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')
    );

    v_resolved := public.internal_resolve_client_import_identity(
      p_workspace_id,
      v_row->>'email',
      v_row->>'phone',
      COALESCE(v_row->>'whatsapp_phone', v_row->>'whatsapp')
    );
    v_resolved_action := v_resolved->>'action';
    v_client_id := NULLIF(v_resolved->>'client_id', '')::uuid;

    IF v_resolved_action = 'fail' OR v_resolved->>'error' IS NOT NULL THEN
      RAISE EXCEPTION 'client_import_failed'
        USING ERRCODE = 'P0001',
              DETAIL = COALESCE(v_resolved->>'error', format('Classification failed for row %s', COALESCE(v_row_id, '?')));
    END IF;

    v_payment_terms_days := public.internal_parse_client_import_payment_terms_days(v_row);

    v_status := LOWER(NULLIF(BTRIM(v_row->>'status'), ''));
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

    IF v_row->>'archived_at' IS NOT NULL AND BTRIM(v_row->>'archived_at') <> '' THEN
      v_archived_at := (v_row->>'archived_at')::timestamptz;
    ELSE
      v_archived_at := NULL;
    END IF;

    IF v_resolved_action = 'update' THEN
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
          WHEN v_row->>'status' IS NOT NULL AND BTRIM(v_row->>'status') <> '' THEN v_is_active
          ELSE c.is_active
        END,
        status = CASE
          WHEN v_row->>'status' IS NOT NULL AND BTRIM(v_row->>'status') <> '' THEN v_status_column
          ELSE c.status
        END,
        archived_at = CASE
          WHEN v_row ? 'archived_at' AND BTRIM(COALESCE(v_row->>'archived_at', '')) <> ''
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

REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_canonical_client_import_email(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_phone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_phone(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_canonical_client_import_phone(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_canonical_client_import_phone(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.internal_client_import_phone_keys_match(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_client_import_phone_keys_match(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_client_import_phone_keys_match(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_client_import_phone_keys_match(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.internal_resolve_client_import_identity(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_resolve_client_import_identity(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_resolve_client_import_identity(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_resolve_client_import_identity(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.internal_canonical_client_import_email(text) IS
  'Canonical email identity key: lower(trim(email)). Used by client import classifier.';

COMMENT ON FUNCTION public.internal_canonical_client_import_phone(text) IS
  'Canonical phone/WhatsApp identity key: digits only (leading + stripped). Used by client import classifier.';

COMMENT ON FUNCTION public.internal_resolve_client_import_identity(uuid, text, text, text) IS
  'Authoritative client import identity classifier for one row. Returns {action, client_id, error}.';

COMMENT ON FUNCTION public.internal_rpc_import_clients(uuid, jsonb, boolean) IS
  'Atomic client import. Dry-run (p_dry_run=true) classifies rows with zero writes and returns authoritative INSERT/UPDATE/FAIL per row. Execute re-resolves identity and mutates atomically.';
