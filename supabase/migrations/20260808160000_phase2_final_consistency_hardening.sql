-- ============================================================================
-- Phase 2 final consistency hardening
-- ============================================================================
-- Forward-only. Adds:
-- 1) Durable workspace-level trial consumption marker
-- 2) DB-authoritative paid monthly invoice limits on INSERT
-- 3) Idempotent entitlement usage reservation lifecycle

-- ---------------------------------------------------------------------------
-- Durable trial consumption evidence (survives missing subscription rows)
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS trial_consumed_at timestamptz;

COMMENT ON COLUMN public.workspaces.trial_consumed_at IS
  'Set once when the workspace consumes its standalone Arrexia trial. Never cleared.';

UPDATE public.workspaces w
SET trial_consumed_at = ws.trial_consumed_at
FROM public.workspace_subscriptions ws
WHERE w.id = ws.workspace_id
  AND w.trial_consumed_at IS NULL
  AND ws.trial_consumed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Idempotent reservation lifecycle for trial usage metering
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_entitlement_reservations (
  reservation_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (
    resource IN (
      'trial_invoices',
      'ai_generations',
      'automated_reminders',
      'manual_email_reminders'
    )
  ),
  amount integer NOT NULL DEFAULT 1 CHECK (amount >= 1),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'consumed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_entitlement_reservations_workspace_idx
  ON public.workspace_entitlement_reservations (workspace_id, resource, state);

ALTER TABLE public.workspace_entitlement_reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_workspace_entitlement_reservations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_entitlement_reservations_set_updated_at
  ON public.workspace_entitlement_reservations;

CREATE TRIGGER workspace_entitlement_reservations_set_updated_at
BEFORE UPDATE ON public.workspace_entitlement_reservations
FOR EACH ROW EXECUTE FUNCTION public.set_workspace_entitlement_reservations_updated_at();

-- Harden usage-table trigger helper from migration 140000 without rewriting that file.
CREATE OR REPLACE FUNCTION public.set_workspace_entitlement_usage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_entitlement_usage_snapshot(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.workspace_entitlement_usage%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.workspace_entitlement_usage u
  WHERE u.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'workspace_id', p_workspace_id,
      'trial_invoices_created', 0,
      'ai_generations_successful', 0,
      'automated_reminders_sent', 0,
      'manual_email_reminders_sent', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'workspace_id', v_row.workspace_id,
    'trial_invoices_created', v_row.trial_invoices_created,
    'ai_generations_successful', v_row.ai_generations_successful,
    'automated_reminders_sent', v_row.automated_reminders_sent,
    'manual_email_reminders_sent', v_row.manual_email_reminders_sent,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reserve_entitlement_usage(
  p_workspace_id uuid,
  p_resource text,
  p_amount integer DEFAULT 1,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.workspace_entitlement_reservations%ROWTYPE;
  v_consume jsonb;
BEGIN
  IF p_workspace_id IS NULL OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and reservation_id are required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'amount must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.workspace_entitlement_reservations r
  WHERE r.reservation_id = p_reservation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.workspace_id IS DISTINCT FROM p_workspace_id
       OR v_existing.resource IS DISTINCT FROM p_resource
       OR v_existing.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'reservation_id reuse mismatch' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'state', v_existing.state,
      'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
    );
  END IF;

  v_consume := public.rpc_try_consume_entitlement_usage(p_workspace_id, p_resource, p_amount);
  IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_consume;
  END IF;

  INSERT INTO public.workspace_entitlement_reservations (
    reservation_id,
    workspace_id,
    resource,
    amount,
    state
  )
  VALUES (
    p_reservation_id,
    p_workspace_id,
    p_resource,
    p_amount,
    'reserved'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'state', 'reserved',
    'usage', v_consume
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_entitlement_usage(
  p_workspace_id uuid,
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.workspace_entitlement_reservations%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and reservation_id are required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.workspace_entitlement_reservations r
  WHERE r.reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_not_found');
  END IF;

  IF v_existing.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'reservation workspace mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_existing.state = 'consumed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'state', 'consumed',
      'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
    );
  END IF;

  IF v_existing.state = 'released' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_released');
  END IF;

  UPDATE public.workspace_entitlement_reservations r
  SET state = 'consumed'
  WHERE r.reservation_id = p_reservation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'state', 'consumed',
    'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_release_entitlement_usage(
  p_workspace_id uuid,
  p_resource text,
  p_amount integer,
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.workspace_entitlement_reservations%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'invalid release parameters' USING ERRCODE = '22023';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'reservation_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_resource NOT IN (
    'trial_invoices',
    'ai_generations',
    'automated_reminders',
    'manual_email_reminders'
  ) THEN
    RAISE EXCEPTION 'invalid resource: %', p_resource USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.workspace_entitlement_reservations r
  WHERE r.reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'released', false, 'reason', 'reservation_not_found');
  END IF;

  IF v_existing.workspace_id IS DISTINCT FROM p_workspace_id
     OR v_existing.resource IS DISTINCT FROM p_resource
     OR v_existing.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'reservation release mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_existing.state = 'released' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'released', false,
      'idempotent', true,
      'state', 'released',
      'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
    );
  END IF;

  IF v_existing.state = 'consumed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'released', false,
      'idempotent', true,
      'state', 'consumed',
      'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
    );
  END IF;

  IF p_resource = 'trial_invoices' THEN
    UPDATE public.workspace_entitlement_usage u
    SET trial_invoices_created = GREATEST(0, u.trial_invoices_created - p_amount)
    WHERE u.workspace_id = p_workspace_id;
  ELSIF p_resource = 'ai_generations' THEN
    UPDATE public.workspace_entitlement_usage u
    SET ai_generations_successful = GREATEST(0, u.ai_generations_successful - p_amount)
    WHERE u.workspace_id = p_workspace_id;
  ELSIF p_resource = 'automated_reminders' THEN
    UPDATE public.workspace_entitlement_usage u
    SET automated_reminders_sent = GREATEST(0, u.automated_reminders_sent - p_amount)
    WHERE u.workspace_id = p_workspace_id;
  ELSE
    UPDATE public.workspace_entitlement_usage u
    SET manual_email_reminders_sent = GREATEST(0, u.manual_email_reminders_sent - p_amount)
    WHERE u.workspace_id = p_workspace_id;
  END IF;

  UPDATE public.workspace_entitlement_reservations r
  SET state = 'released'
  WHERE r.reservation_id = p_reservation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'released', true,
    'idempotent', false,
    'state', 'released',
    'usage', public.internal_entitlement_usage_snapshot(p_workspace_id)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_release_entitlement_usage(uuid, text, integer);

REVOKE EXECUTE ON FUNCTION public.rpc_reserve_entitlement_usage(uuid, text, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_reserve_entitlement_usage(uuid, text, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reserve_entitlement_usage(uuid, text, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reserve_entitlement_usage(uuid, text, integer, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_finalize_entitlement_usage(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_entitlement_usage(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_entitlement_usage(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_entitlement_usage(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Authoritative paid monthly invoice limits on INSERT (Starter/Pro)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_invoice_counts_toward_monthly_limit(
  p_issue_date date,
  p_created_at timestamptz,
  p_month_start timestamptz,
  p_month_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (
      p_issue_date IS NOT NULL
      AND p_issue_date >= p_month_start::date
      AND p_issue_date < p_month_end::date
    )
    OR (
      p_issue_date IS NULL
      AND p_created_at >= p_month_start
      AND p_created_at < p_month_end
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_invoices_enforce_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state record;
  v_consume jsonb;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_monthly_invoices integer := 0;
  v_new_counts boolean := false;
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

  IF v_state.entitlement_state = 'trial' THEN
    v_consume := public.rpc_try_consume_entitlement_usage(NEW.workspace_id, 'trial_invoices', 1);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trial_invoice_limit_reached' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF v_state.entitlement_state = 'paid'
     AND v_state.invoice_limit_monthly IS NOT NULL THEN
    v_month_start := date_trunc('month', timezone('UTC', now()));
    v_month_end := v_month_start + interval '1 month';

    v_new_counts := public.internal_invoice_counts_toward_monthly_limit(
      NEW.issue_date,
      COALESCE(NEW.created_at, now()),
      v_month_start,
      v_month_end
    );

    IF v_new_counts THEN
      SELECT COUNT(*)::integer
      INTO v_monthly_invoices
      FROM public.invoices i
      WHERE i.workspace_id = NEW.workspace_id
        AND public.internal_invoice_counts_toward_monthly_limit(
          i.issue_date,
          i.created_at,
          v_month_start,
          v_month_end
        );

      IF v_monthly_invoices + 1 > v_state.invoice_limit_monthly THEN
        RAISE EXCEPTION 'invoice_limit_reached'
          USING ERRCODE = 'P0001',
                DETAIL = format('%s/%s', v_monthly_invoices + 1, v_state.invoice_limit_monthly);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_enforce_trial_usage ON public.invoices;
CREATE TRIGGER invoices_enforce_entitlement
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoices_enforce_entitlement();

-- Preserve durable trial consumption marker during atomic billing changes.
CREATE OR REPLACE FUNCTION public.rpc_change_workspace_plan_atomic(
  p_workspace_id uuid,
  p_target_plan text,
  p_invoice_limit_monthly integer,
  p_client_limit integer,
  p_subscription_status text,
  p_subscription_plan text,
  p_payment_provider text DEFAULT 'manual',
  p_trial_starts_at timestamptz DEFAULT NULL,
  p_trial_ends_at timestamptz DEFAULT NULL,
  p_current_period_starts_at timestamptz DEFAULT NULL,
  p_current_period_ends_at timestamptz DEFAULT NULL,
  p_cancel_at_period_end boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan_updated_at timestamptz;
  v_subscription_updated_at timestamptz;
  v_stored_plan text;
  v_subscription_plan text;
  v_subscription_status text;
  v_payment_provider text;
  v_trial_starts_at timestamptz;
  v_trial_ends_at timestamptz;
  v_trial_consumed_at timestamptz;
  v_workspace_trial_consumed_at timestamptz;
  v_current_period_starts_at timestamptz;
  v_current_period_ends_at timestamptz;
  v_cancel_at_period_end boolean;
  v_new_trial_consumed_at timestamptz;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_plan IS NULL OR p_target_plan NOT IN ('free', 'starter', 'pro', 'business') THEN
    RAISE EXCEPTION 'invalid target plan: %', p_target_plan
      USING ERRCODE = '22023';
  END IF;

  IF p_subscription_status IS NULL
     OR p_subscription_status NOT IN ('trial', 'active', 'past_due', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'invalid subscription status: %', p_subscription_status
      USING ERRCODE = '22023';
  END IF;

  IF p_subscription_plan IS NULL
     OR p_subscription_plan NOT IN ('free', 'starter', 'pro', 'business') THEN
    RAISE EXCEPTION 'invalid subscription plan: %', p_subscription_plan
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace not found: %', p_workspace_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM w.id
  FROM public.workspaces w
  WHERE w.id = p_workspace_id
  FOR UPDATE;

  SELECT w.trial_consumed_at
  INTO v_workspace_trial_consumed_at
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  SELECT ws.trial_consumed_at
  INTO v_trial_consumed_at
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id;

  v_trial_consumed_at := COALESCE(v_workspace_trial_consumed_at, v_trial_consumed_at);

  INSERT INTO public.workspace_plans (
    workspace_id,
    plan,
    invoice_limit_monthly,
    client_limit,
    updated_at
  )
  VALUES (
    p_workspace_id,
    p_target_plan,
    p_invoice_limit_monthly,
    p_client_limit,
    now()
  )
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    plan = EXCLUDED.plan,
    invoice_limit_monthly = EXCLUDED.invoice_limit_monthly,
    client_limit = EXCLUDED.client_limit,
    updated_at = now()
  RETURNING updated_at INTO v_plan_updated_at;

  v_new_trial_consumed_at := CASE
    WHEN p_subscription_status = 'trial' AND v_trial_consumed_at IS NULL
      THEN COALESCE(p_trial_starts_at, now())
    ELSE v_trial_consumed_at
  END;

  INSERT INTO public.workspace_subscriptions (
    workspace_id,
    plan,
    status,
    payment_provider,
    trial_starts_at,
    trial_ends_at,
    trial_consumed_at,
    current_period_starts_at,
    current_period_ends_at,
    cancel_at_period_end,
    updated_at
  )
  VALUES (
    p_workspace_id,
    p_subscription_plan,
    p_subscription_status,
    COALESCE(NULLIF(btrim(p_payment_provider), ''), 'manual'),
    p_trial_starts_at,
    p_trial_ends_at,
    v_new_trial_consumed_at,
    p_current_period_starts_at,
    p_current_period_ends_at,
    COALESCE(p_cancel_at_period_end, false),
    now()
  )
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    payment_provider = EXCLUDED.payment_provider,
    trial_starts_at = COALESCE(public.workspace_subscriptions.trial_starts_at, EXCLUDED.trial_starts_at),
    trial_ends_at = COALESCE(public.workspace_subscriptions.trial_ends_at, EXCLUDED.trial_ends_at),
    trial_consumed_at = COALESCE(public.workspace_subscriptions.trial_consumed_at, EXCLUDED.trial_consumed_at),
    current_period_starts_at = EXCLUDED.current_period_starts_at,
    current_period_ends_at = EXCLUDED.current_period_ends_at,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at = now()
  RETURNING updated_at INTO v_subscription_updated_at;

  IF v_new_trial_consumed_at IS NOT NULL THEN
    UPDATE public.workspaces w
    SET trial_consumed_at = COALESCE(w.trial_consumed_at, v_new_trial_consumed_at)
    WHERE w.id = p_workspace_id;
  END IF;

  SELECT
    wp.plan,
    wp.updated_at
  INTO
    v_stored_plan,
    v_plan_updated_at
  FROM public.workspace_plans wp
  WHERE wp.workspace_id = p_workspace_id;

  IF v_stored_plan IS DISTINCT FROM p_target_plan THEN
    RAISE EXCEPTION 'stored plan mismatch after upsert'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    ws.plan,
    ws.status,
    ws.payment_provider,
    ws.trial_starts_at,
    ws.trial_ends_at,
    ws.trial_consumed_at,
    ws.current_period_starts_at,
    ws.current_period_ends_at,
    ws.cancel_at_period_end,
    ws.updated_at
  INTO
    v_subscription_plan,
    v_subscription_status,
    v_payment_provider,
    v_trial_starts_at,
    v_trial_ends_at,
    v_trial_consumed_at,
    v_current_period_starts_at,
    v_current_period_ends_at,
    v_cancel_at_period_end,
    v_subscription_updated_at
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id;

  SELECT w.trial_consumed_at
  INTO v_workspace_trial_consumed_at
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;

  RETURN jsonb_build_object(
    'workspace_id', p_workspace_id,
    'stored_plan', v_stored_plan,
    'plan_updated_at', v_plan_updated_at,
    'subscription_plan', v_subscription_plan,
    'subscription_status', v_subscription_status,
    'payment_provider', v_payment_provider,
    'trial_starts_at', v_trial_starts_at,
    'trial_ends_at', v_trial_ends_at,
    'trial_consumed_at', COALESCE(v_workspace_trial_consumed_at, v_trial_consumed_at),
    'current_period_starts_at', v_current_period_starts_at,
    'current_period_ends_at', v_current_period_ends_at,
    'cancel_at_period_end', v_cancel_at_period_end,
    'subscription_updated_at', v_subscription_updated_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Consolidate public invoice import to one hardened service_role RPC
-- Production may have 150000's thin wrapper without internal_import_invoices_grouped
-- when only legacy import_invoices_grouped(json,uuid,boolean) existed at apply time.
-- Preserve/create internal mutation implementation BEFORE dropping any overload.
-- ---------------------------------------------------------------------------

DO $preserve_internal$
DECLARE
  v_legacy_oid oid;
  v_def text;
BEGIN
  IF to_regprocedure('public.internal_import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL THEN
    RETURN;
  END IF;

  IF to_regprocedure('public.import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'import_invoices_grouped'
         AND pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_rows jsonb, p_dry_run boolean'
         AND position('internal_import_invoices_grouped' in p.prosrc) > 0
     ) THEN
    ALTER FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean)
      RENAME TO internal_import_invoices_grouped;
    RETURN;
  END IF;

  SELECT p.oid
  INTO v_legacy_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'import_invoices_grouped'
    AND pg_get_function_identity_arguments(p.oid) = 'p_rows json, p_workspace_id uuid, p_dry_run boolean'
  LIMIT 1;

  IF v_legacy_oid IS NOT NULL THEN
    v_def := pg_get_functiondef(v_legacy_oid);
    v_def := regexp_replace(
      v_def,
      'CREATE OR REPLACE FUNCTION public\.import_invoices_grouped\(p_rows json, p_workspace_id uuid, p_dry_run boolean\)',
      'CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped(p_workspace_id uuid, p_rows jsonb, p_dry_run boolean)',
      'i'
    );
    v_def := regexp_replace(
      v_def,
      'SET search_path TO public',
      'SET search_path = pg_catalog, public',
      'i'
    );
    v_def := regexp_replace(
      v_def,
      'SET search_path = public',
      'SET search_path = pg_catalog, public',
      'i'
    );
    EXECUTE v_def;
  END IF;
END;
$preserve_internal$;

DO $install_canonical_internal$
BEGIN
  IF to_regprocedure('public.internal_import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL THEN
    RETURN;
  END IF;

  EXECUTE $canonical_internal$
CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped(
  p_workspace_id uuid,
  p_rows jsonb,
  p_dry_run boolean default true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
DECLARE
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
  
  -- Currency default (DO NOT reference workspaces.currency)
  v_default_currency char(3) := 'USD';
  
  -- Duplicate detection: track invoice_numbers seen in invoice rows
  v_invoice_numbers_seen jsonb := '{}'::jsonb; -- invoice_number -> count
BEGIN
  -- Fetch organization_id from workspace (DO NOT reference workspaces.currency)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'organization_id'
  ) INTO v_has_org_id;
  
  -- Fetch workspace organization_id
  SELECT organization_id INTO v_org_id
  FROM workspaces
  WHERE id = p_workspace_id
  LIMIT 1;
  
  -- Guard: if organization_id column exists, workspace must have organization_id
  IF v_has_org_id AND v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array('Workspace is missing organization_id. Please contact support to configure your workspace.')
    );
  END IF;
  
  -- Shape check
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'errors', jsonb_build_array('p_rows must be a JSON array'));
  END IF;

  -- Validate (first pass: detect duplicates and validate fields)
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt NOT IN ('invoice','item') THEN
      v_errors := v_errors || jsonb_build_array(format('Invalid row_type "%s" (invoice_number=%s)', v_rt, v_inv));
      CONTINUE;
    END IF;

    IF v_inv = '' THEN
      v_errors := v_errors || jsonb_build_array('Missing invoice_number');
      CONTINUE;
    END IF;

    IF v_rt = 'invoice' THEN
      -- Detect duplicate invoice_number in invoice rows
      IF v_invoice_numbers_seen ? v_inv THEN
        v_errors := v_errors || jsonb_build_array(format('Duplicate invoice_number in file: %s', v_inv));
      ELSE
        v_invoice_numbers_seen := v_invoice_numbers_seen || jsonb_build_object(v_inv, 1);
      END IF;
      
      IF COALESCE(v_row->>'issue_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing issue_date for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'due_date','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing due_date for %s', v_inv));
      END IF;
      
      -- Currency validation: must be 3-letter ISO code (A-Z only) if provided
      IF COALESCE(v_row->>'currency','') <> '' THEN
        DECLARE
          v_currency text := UPPER(TRIM(COALESCE(v_row->>'currency','')));
        BEGIN
          IF LENGTH(v_currency) <> 3 OR v_currency !~ '^[A-Z]{3}$' THEN
            v_errors := v_errors || jsonb_build_array(format('Invalid currency "%s" for %s (must be a 3-letter ISO code like USD, EUR, etc.)', v_row->>'currency', v_inv));
          END IF;
        END;
      END IF;

      -- Status validation: only Draft/Sent/Void allowed
      IF LOWER(COALESCE(v_row->>'status','')) NOT IN ('draft','sent','void') THEN
        v_errors := v_errors || jsonb_build_array(format('Invalid status "%s" for %s (allowed Draft/Sent/Void)', COALESCE(v_row->>'status',''), v_inv));
      END IF;

      IF COALESCE(v_row->>'client_email','') = '' AND COALESCE(v_row->>'client_name','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing client_email or client_name for %s', v_inv));
      END IF;
    END IF;

    IF v_rt = 'item' THEN
      IF COALESCE(v_row->>'item_description','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing item_description for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'quantity','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing quantity for %s', v_inv));
      END IF;
      IF COALESCE(v_row->>'unit_price','') = '' THEN
        v_errors := v_errors || jsonb_build_array(format('Missing unit_price for %s', v_inv));
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'errors', '[]'::jsonb,
      'created', jsonb_build_object('clients',0,'invoices',0,'items',0)
    );
  END IF;

  -- Execute: invoices + clients
  -- Process invoice rows first (build v_invoice_ids map), then items
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'invoice' THEN
      -- Resolve client
      v_client_id := NULL;
      
      -- 1) Try client_email first (case-insensitive, non-archived)
      IF COALESCE(v_row->>'client_email','') <> '' THEN
        SELECT id INTO v_client_id
        FROM clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND LOWER(TRIM(email)) = LOWER(TRIM(v_row->>'client_email'))
        LIMIT 1;
      END IF;
      
      -- 2) If not found AND client_name provided: try lookup by workspace_id + normalized lower(name)
      IF v_client_id IS NULL AND COALESCE(v_row->>'client_name','') <> '' THEN
        DECLARE
          v_client_count int;
        BEGIN
          SELECT COUNT(*) INTO v_client_count
          FROM clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'));
          
          IF v_client_count = 0 THEN
            -- Auto-create client if not found
            INSERT INTO clients (workspace_id, organization_id, name, email, is_active, archived_at)
            VALUES (
              p_workspace_id,
              CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
              TRIM(v_row->>'client_name'),
              NULLIF(TRIM(v_row->>'client_email'), ''),
              true,
              NULL
            )
            RETURNING id INTO v_client_id;
            v_created_clients := v_created_clients + 1;
          ELSIF v_client_count = 1 THEN
            SELECT id INTO v_client_id
            FROM clients
            WHERE workspace_id = p_workspace_id
              AND archived_at IS NULL
              AND LOWER(TRIM(name)) = LOWER(TRIM(v_row->>'client_name'))
            LIMIT 1;
          ELSE
            -- Multiple clients match name - error
            v_errors := v_errors || jsonb_build_array(format('Multiple clients match name "%s" for %s. Use client_email or unique identifier.', v_row->>'client_name', v_inv));
            CONTINUE;
          END IF;
        END;
      END IF;
      
      IF v_client_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array(format('Client not found for %s', v_inv));
        CONTINUE;
      END IF;

      -- Upsert invoice (ON CONFLICT on unique index)
      INSERT INTO invoices (
        workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
        amount, total_paid, outstanding_amount, payment_state
      )
      VALUES (
        p_workspace_id, 
        CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
        v_client_id, 
        v_inv,
        (v_row->>'issue_date')::date,
        (v_row->>'due_date')::date,
        COALESCE(NULLIF(UPPER(LEFT(TRIM(v_row->>'currency'),3)),'')::char(3), v_default_currency),
        LOWER(TRIM(v_row->>'status')), -- Store as lowercase: draft/sent/void
        NULLIF(v_row->>'po_number',''),
        NULLIF(v_row->>'notes',''),
        0, 0, 0, 'unpaid' -- Will be computed from items after insert
      )
      ON CONFLICT (workspace_id, invoice_number) WHERE archived_at IS NULL
      DO UPDATE SET
        client_id = EXCLUDED.client_id,
        issue_date = EXCLUDED.issue_date, -- Preserve exactly as provided
        due_date = EXCLUDED.due_date, -- Preserve exactly as provided
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        po_number = EXCLUDED.po_number,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id INTO v_invoice_id;
      
      IF v_invoice_id IS NULL THEN
        SELECT id INTO v_invoice_id
        FROM invoices
        WHERE workspace_id = p_workspace_id
          AND invoice_number = v_inv
          AND archived_at IS NULL
        LIMIT 1;
      END IF;
      
      -- Store invoice_id in map (only if not already present to prevent overwrites)
      IF NOT (v_invoice_ids ? v_inv) THEN
        v_invoice_ids := v_invoice_ids || jsonb_build_object(v_inv, v_invoice_id::text);
        v_created_invoices := v_created_invoices + 1;
      ELSE
        -- Invoice already processed - this should not happen if validation worked correctly
        -- But if it does, use the existing invoice_id (don't overwrite)
        v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      END IF;
    END IF;
  END LOOP;

  -- Process item rows (bind to nearest preceding invoice header)
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_rt := LOWER(COALESCE(v_row->>'row_type',''));
    v_inv := COALESCE(v_row->>'invoice_number','');

    IF v_rt = 'item' THEN
      IF NOT (v_invoice_ids ? v_inv) THEN
        v_errors := v_errors || jsonb_build_array(format('Item row references invoice_number "%s" which does not exist in this file', v_inv));
        CONTINUE;
      END IF;
      
      v_invoice_id := (v_invoice_ids->>v_inv)::uuid;
      
      -- Delete existing items for this invoice (replace strategy)
      DELETE FROM invoice_items WHERE invoice_id = v_invoice_id;
      
      -- Insert new item
      INSERT INTO invoice_items (
        workspace_id, organization_id, invoice_id, description, quantity, unit_price, amount
      )
      VALUES (
        p_workspace_id,
        CASE WHEN v_has_org_id THEN v_org_id ELSE NULL END,
        v_invoice_id,
        TRIM(v_row->>'item_description'),
        (v_row->>'quantity')::numeric,
        (v_row->>'unit_price')::numeric,
        ((v_row->>'quantity')::numeric * (v_row->>'unit_price')::numeric)
      );
      v_created_items := v_created_items + 1;
    END IF;
  END LOOP;

  -- Compute totals for all invoices
  FOR v_inv, v_invoice_id IN SELECT * FROM jsonb_each_text(v_invoice_ids)
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = (v_invoice_id::uuid);
    
    UPDATE invoices
    SET amount = v_subtotal,
        outstanding_amount = v_subtotal - COALESCE(total_paid, 0),
        updated_at = NOW()
    WHERE id = (v_invoice_id::uuid);
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', v_errors,
      'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'errors', '[]'::jsonb,
    'created', jsonb_build_object('clients', v_created_clients, 'invoices', v_created_invoices, 'items', v_created_items)
  );
END;
$func$;
$canonical_internal$;
END;
$install_canonical_internal$;

DO $verify_internal_import$
BEGIN
  IF to_regprocedure('public.internal_import_invoices_grouped(uuid,jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'internal_import_invoices_grouped(uuid,jsonb,boolean) must exist before invoice import consolidation';
  END IF;
END;
$verify_internal_import$;

DROP FUNCTION IF EXISTS public.import_invoices_grouped(json, uuid, boolean);

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

REVOKE EXECUTE ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) IS
  'Canonical invoice import RPC: entitlement preflight on execute, delegates to internal_import_invoices_grouped.';
COMMENT ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) IS
  'Internal invoice import mutation implementation preserved from production/repo canonical importer.';

COMMENT ON FUNCTION public.trg_invoices_enforce_entitlement() IS
  'Authoritative invoice entitlement enforcement for trial totals and paid monthly limits.';
COMMENT ON FUNCTION public.rpc_reserve_entitlement_usage(uuid, text, integer, uuid) IS
  'Idempotently reserves trial usage by reservation_id before AI/reminder operations.';
COMMENT ON FUNCTION public.rpc_finalize_entitlement_usage(uuid, uuid) IS
  'Marks a reserved trial usage slot as consumed after successful operation.';
COMMENT ON FUNCTION public.rpc_release_entitlement_usage(uuid, text, integer, uuid) IS
  'Idempotently releases a reserved trial usage slot after failed operation. reservation_id is required.';
