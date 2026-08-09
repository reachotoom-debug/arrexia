-- ============================================================================
-- Entitlement atomic enforcement (import concurrency + usage quotas)
-- ============================================================================
-- Forward-only. Adds authoritative DB enforcement; does not bulk-rewrite accounts.

-- Trial limits (must match lib/billing/trialConfig.ts)
-- clients: 50 active (counted at insert)
-- trial_invoices: 75 total
-- ai_generations: 50
-- automated_reminders: 75
-- manual_email_reminders: 75

CREATE OR REPLACE FUNCTION public.internal_entitlement_trial_limit(p_resource text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_resource
    WHEN 'trial_invoices' THEN 75
    WHEN 'ai_generations' THEN 50
    WHEN 'automated_reminders' THEN 75
    WHEN 'manual_email_reminders' THEN 75
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_try_consume_entitlement_usage(
  p_workspace_id uuid,
  p_resource text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer;
  v_row public.workspace_entitlement_usage%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'amount must be >= 1' USING ERRCODE = '22023';
  END IF;

  v_limit := public.internal_entitlement_trial_limit(p_resource);
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'invalid resource: %', p_resource USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspace_entitlement_usage (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  IF p_resource = 'trial_invoices' THEN
    UPDATE public.workspace_entitlement_usage u
    SET trial_invoices_created = u.trial_invoices_created + p_amount
    WHERE u.workspace_id = p_workspace_id
      AND u.trial_invoices_created + p_amount <= v_limit
    RETURNING u.* INTO v_row;
  ELSIF p_resource = 'ai_generations' THEN
    UPDATE public.workspace_entitlement_usage u
    SET ai_generations_successful = u.ai_generations_successful + p_amount
    WHERE u.workspace_id = p_workspace_id
      AND u.ai_generations_successful + p_amount <= v_limit
    RETURNING u.* INTO v_row;
  ELSIF p_resource = 'automated_reminders' THEN
    UPDATE public.workspace_entitlement_usage u
    SET automated_reminders_sent = u.automated_reminders_sent + p_amount
    WHERE u.workspace_id = p_workspace_id
      AND u.automated_reminders_sent + p_amount <= v_limit
    RETURNING u.* INTO v_row;
  ELSE
    UPDATE public.workspace_entitlement_usage u
    SET manual_email_reminders_sent = u.manual_email_reminders_sent + p_amount
    WHERE u.workspace_id = p_workspace_id
      AND u.manual_email_reminders_sent + p_amount <= v_limit
    RETURNING u.* INTO v_row;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'limit_reached',
      'resource', p_resource,
      'limit', v_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'workspace_id', v_row.workspace_id,
    'trial_invoices_created', v_row.trial_invoices_created,
    'ai_generations_successful', v_row.ai_generations_successful,
    'automated_reminders_sent', v_row.automated_reminders_sent,
    'manual_email_reminders_sent', v_row.manual_email_reminders_sent,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_release_entitlement_usage(
  p_workspace_id uuid,
  p_resource text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.workspace_entitlement_usage%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'invalid release parameters' USING ERRCODE = '22023';
  END IF;

  IF p_resource NOT IN (
    'trial_invoices',
    'ai_generations',
    'automated_reminders',
    'manual_email_reminders'
  ) THEN
    RAISE EXCEPTION 'invalid resource: %', p_resource USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'trial_invoices' THEN
    UPDATE public.workspace_entitlement_usage u
    SET trial_invoices_created = GREATEST(0, u.trial_invoices_created - p_amount)
    WHERE u.workspace_id = p_workspace_id
    RETURNING u.* INTO v_row;
  ELSIF p_resource = 'ai_generations' THEN
    UPDATE public.workspace_entitlement_usage u
    SET ai_generations_successful = GREATEST(0, u.ai_generations_successful - p_amount)
    WHERE u.workspace_id = p_workspace_id
    RETURNING u.* INTO v_row;
  ELSIF p_resource = 'automated_reminders' THEN
    UPDATE public.workspace_entitlement_usage u
    SET automated_reminders_sent = GREATEST(0, u.automated_reminders_sent - p_amount)
    WHERE u.workspace_id = p_workspace_id
    RETURNING u.* INTO v_row;
  ELSE
    UPDATE public.workspace_entitlement_usage u
    SET manual_email_reminders_sent = GREATEST(0, u.manual_email_reminders_sent - p_amount)
    WHERE u.workspace_id = p_workspace_id
    RETURNING u.* INTO v_row;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'released', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'released', true,
    'workspace_id', v_row.workspace_id,
    'trial_invoices_created', v_row.trial_invoices_created,
    'ai_generations_successful', v_row.ai_generations_successful,
    'automated_reminders_sent', v_row.automated_reminders_sent,
    'manual_email_reminders_sent', v_row.manual_email_reminders_sent
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_try_consume_entitlement_usage(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_try_consume_entitlement_usage(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_try_consume_entitlement_usage(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_try_consume_entitlement_usage(uuid, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer) TO service_role;

-- Replace blind increment with limit-aware consume (backward-compatible name).
CREATE OR REPLACE FUNCTION public.rpc_increment_entitlement_usage(
  p_workspace_id uuid,
  p_resource text,
  p_amount integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.rpc_try_consume_entitlement_usage(p_workspace_id, p_resource, p_amount);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'entitlement limit reached for %', p_resource USING ERRCODE = 'P0001';
  END IF;
  RETURN v_result;
END;
$$;

-- Resolve import enforcement state (mirrors application resolver semantics).
CREATE OR REPLACE FUNCTION public.internal_import_entitlement_state(
  p_workspace_id uuid,
  OUT entitlement_state text,
  OUT can_mutate boolean,
  OUT client_limit integer,
  OUT trial_invoice_limit integer,
  OUT invoice_limit_monthly integer
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan text;
  v_sub record;
  v_now timestamptz := now();
BEGIN
  SELECT wp.plan, wp.client_limit, wp.invoice_limit_monthly
  INTO v_plan, client_limit, invoice_limit_monthly
  FROM public.workspace_plans wp
  WHERE wp.workspace_id = p_workspace_id;

  IF v_plan IS NULL THEN
    v_plan := 'free';
    client_limit := 5;
    invoice_limit_monthly := 5;
  END IF;

  SELECT ws.status, ws.plan, ws.trial_starts_at, ws.trial_ends_at, ws.trial_consumed_at
  INTO v_sub
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id;

  trial_invoice_limit := 75;

  IF v_sub.status IN ('active', 'past_due')
     AND v_sub.plan IN ('starter', 'pro', 'business') THEN
    entitlement_state := 'paid';
    can_mutate := true;
    IF v_sub.plan = 'business' THEN
      client_limit := NULL;
      invoice_limit_monthly := NULL;
    END IF;
    RETURN;
  END IF;

  IF v_sub.status = 'trial'
     AND (
       v_sub.trial_consumed_at IS NOT NULL
       OR v_sub.trial_starts_at IS NOT NULL
       OR v_sub.plan IN ('starter', 'pro', 'business')
     ) THEN
    IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > v_now THEN
      entitlement_state := 'trial';
      can_mutate := true;
      client_limit := 50;
      invoice_limit_monthly := NULL;
      RETURN;
    END IF;
    entitlement_state := 'trial_expired';
    can_mutate := false;
    client_limit := 50;
    invoice_limit_monthly := NULL;
    RETURN;
  END IF;

  IF v_sub.status IN ('cancelled', 'expired') THEN
    entitlement_state := 'trial_expired';
    can_mutate := false;
    RETURN;
  END IF;

  entitlement_state := 'legacy_free';
  can_mutate := false;
  client_limit := COALESCE(client_limit, 5);
  invoice_limit_monthly := COALESCE(invoice_limit_monthly, 5);
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_import_entitlement_preflight(
  p_workspace_id uuid,
  p_new_clients integer,
  p_new_invoices integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state record;
  v_active_clients integer := 0;
  v_trial_invoices_used integer := 0;
  v_monthly_invoices integer := 0;
  v_month_start timestamptz;
  v_month_end timestamptz;
BEGIN
  IF p_new_clients IS NULL OR p_new_clients < 0 OR p_new_invoices IS NULL OR p_new_invoices < 0 THEN
    RAISE EXCEPTION 'invalid import counts' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.workspaces w
  WHERE w.id = p_workspace_id
  FOR UPDATE;

  SELECT *
  INTO v_state
  FROM public.internal_import_entitlement_state(p_workspace_id) s;

  IF NOT v_state.can_mutate THEN
    RAISE EXCEPTION 'entitlement_read_only'
      USING ERRCODE = 'P0001', DETAIL = v_state.entitlement_state;
  END IF;

  IF p_new_clients > 0 THEN
    SELECT COUNT(*)::integer
    INTO v_active_clients
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id
      AND c.archived_at IS NULL;

    IF v_state.client_limit IS NOT NULL
       AND v_active_clients + p_new_clients > v_state.client_limit THEN
      RAISE EXCEPTION 'client_limit_reached'
        USING ERRCODE = 'P0001',
              DETAIL = format('%s/%s', v_active_clients + p_new_clients, v_state.client_limit);
    END IF;
  END IF;

  IF p_new_invoices > 0 THEN
    IF v_state.entitlement_state = 'trial' THEN
      INSERT INTO public.workspace_entitlement_usage (workspace_id)
      VALUES (p_workspace_id)
      ON CONFLICT (workspace_id) DO NOTHING;

      SELECT u.trial_invoices_created
      INTO v_trial_invoices_used
      FROM public.workspace_entitlement_usage u
      WHERE u.workspace_id = p_workspace_id
      FOR UPDATE;

      IF v_trial_invoices_used + p_new_invoices > v_state.trial_invoice_limit THEN
        RAISE EXCEPTION 'trial_invoice_limit_reached'
          USING ERRCODE = 'P0001',
                DETAIL = format('%s/%s', v_trial_invoices_used + p_new_invoices, v_state.trial_invoice_limit);
      END IF;
    ELSIF v_state.entitlement_state = 'paid'
          AND v_state.invoice_limit_monthly IS NOT NULL THEN
      v_month_start := date_trunc('month', timezone('UTC', now()));
      v_month_end := v_month_start + interval '1 month';

      SELECT COUNT(*)::integer
      INTO v_monthly_invoices
      FROM public.invoices i
      WHERE i.workspace_id = p_workspace_id
        AND (
          (i.issue_date IS NOT NULL AND i.issue_date >= v_month_start::date AND i.issue_date < v_month_end::date)
          OR (
            i.issue_date IS NULL
            AND i.created_at >= v_month_start
            AND i.created_at < v_month_end
          )
        );

      IF v_monthly_invoices + p_new_invoices > v_state.invoice_limit_monthly THEN
        RAISE EXCEPTION 'invoice_limit_reached'
          USING ERRCODE = 'P0001',
                DETAIL = format('%s/%s', v_monthly_invoices + p_new_invoices, v_state.invoice_limit_monthly);
      END IF;
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.internal_import_entitlement_preflight(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_import_entitlement_preflight(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_import_entitlement_preflight(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_import_entitlement_preflight(uuid, integer, integer) TO service_role;

-- Authoritative client capacity on every insert (covers concurrent single creates + imports).
CREATE OR REPLACE FUNCTION public.trg_clients_enforce_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state record;
  v_active_clients integer := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.workspaces w
  WHERE w.id = NEW.workspace_id
  FOR UPDATE;

  SELECT *
  INTO v_state
  FROM public.internal_import_entitlement_state(NEW.workspace_id) s;

  IF NOT v_state.can_mutate THEN
    RAISE EXCEPTION 'entitlement_read_only'
      USING ERRCODE = 'P0001', DETAIL = v_state.entitlement_state;
  END IF;

  IF v_state.client_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_clients
  FROM public.clients c
  WHERE c.workspace_id = NEW.workspace_id
    AND c.archived_at IS NULL;

  IF v_active_clients + 1 > v_state.client_limit THEN
    RAISE EXCEPTION 'client_limit_reached'
      USING ERRCODE = 'P0001',
            DETAIL = format('%s/%s', v_active_clients + 1, v_state.client_limit);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_enforce_entitlement_capacity ON public.clients;
CREATE TRIGGER clients_enforce_entitlement_capacity
BEFORE INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.trg_clients_enforce_capacity();

-- Authoritative trial invoice usage on every insert.
CREATE OR REPLACE FUNCTION public.trg_invoices_enforce_trial_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state record;
  v_consume jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_state
  FROM public.internal_import_entitlement_state(NEW.workspace_id) s;

  IF v_state.entitlement_state = 'trial' THEN
    v_consume := public.rpc_try_consume_entitlement_usage(NEW.workspace_id, 'trial_invoices', 1);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trial_invoice_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_enforce_trial_usage ON public.invoices;
CREATE TRIGGER invoices_enforce_trial_usage
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoices_enforce_trial_usage();

-- Wrap import RPCs so preflight shares the import transaction lock.
DO $wrap$
BEGIN
  IF to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL
     AND to_regprocedure('public.internal_rpc_import_clients(uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.rpc_import_clients(uuid, jsonb)
      RENAME TO internal_rpc_import_clients;
  END IF;
END;
$wrap$;

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

  RETURN public.internal_rpc_import_clients(p_workspace_id, p_rows);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) TO service_role;

DO $wrap$
BEGIN
  IF to_regprocedure('public.import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL
     AND to_regprocedure('public.internal_import_invoices_grouped(uuid,jsonb,boolean)') IS NULL THEN
    ALTER FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean)
      RENAME TO internal_import_invoices_grouped;
  END IF;
END;
$wrap$;

CREATE OR REPLACE FUNCTION public.import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_invoices integer := 0;
BEGIN
  IF COALESCE(p_dry_run, true) IS NOT TRUE
     AND p_rows IS NOT NULL
     AND jsonb_typeof(p_rows) = 'array' THEN
    SELECT COUNT(*)::integer
    INTO v_new_invoices
    FROM jsonb_array_elements(p_rows) elem
    WHERE LOWER(COALESCE(elem->>'row_type', '')) = 'invoice';

    PERFORM public.internal_import_entitlement_preflight(p_workspace_id, 0, v_new_invoices);
  END IF;

  RETURN public.internal_import_invoices_grouped(p_workspace_id, p_rows, p_dry_run);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.rpc_try_consume_entitlement_usage(uuid, text, integer) IS
  'Atomically validates trial quota and consumes usage when allowed.';
COMMENT ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer) IS
  'Releases previously reserved/consumed trial usage (for failed operations).';
