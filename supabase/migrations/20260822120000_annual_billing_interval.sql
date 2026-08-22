-- Annual Billing Lifecycle V1: persist billing_interval on workspace_subscriptions
-- and extend rpc_change_workspace_plan_atomic (phase-2 hardened definition).

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual'));

COMMENT ON COLUMN public.workspace_subscriptions.billing_interval IS
  'Commercial billing cadence for paid subscriptions. Entitlements depend on plan only, not interval.';

DROP FUNCTION IF EXISTS public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean
);

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
  p_cancel_at_period_end boolean DEFAULT false,
  p_billing_interval text DEFAULT 'monthly'
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
  v_billing_interval text;
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

  IF p_billing_interval IS NULL OR p_billing_interval NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'invalid billing interval: %', p_billing_interval
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
    billing_interval,
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
    p_billing_interval,
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
    billing_interval = EXCLUDED.billing_interval,
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
    ws.billing_interval,
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
    v_billing_interval,
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
    'billing_interval', v_billing_interval,
    'subscription_updated_at', v_subscription_updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  text
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  text
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  text
) TO service_role;

COMMENT ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean,
  text
) IS
  'Atomically upserts workspace_plans and workspace_subscriptions for trusted server-side billing mutations. Transition policy is enforced in application code before invocation.';
