-- ============================================================================
-- Standalone Arrexia trial lifecycle + entitlement usage metering
-- ============================================================================
-- Adds durable one-trial tracking and server-authoritative usage counters.
-- Does NOT bulk-rewrite legacy trial rows.

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS trial_consumed_at timestamptz;

COMMENT ON COLUMN public.workspace_subscriptions.trial_consumed_at IS
  'Set once when the workspace consumes its standalone Arrexia trial. Never cleared.';

-- Backfill consumed marker for existing trial history without rewriting plan values.
UPDATE public.workspace_subscriptions ws
SET trial_consumed_at = COALESCE(ws.trial_starts_at, ws.created_at)
WHERE ws.trial_consumed_at IS NULL
  AND (
    ws.status = 'trial'
    OR ws.trial_starts_at IS NOT NULL
  );

CREATE TABLE IF NOT EXISTS public.workspace_entitlement_usage (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trial_invoices_created integer NOT NULL DEFAULT 0 CHECK (trial_invoices_created >= 0),
  ai_generations_successful integer NOT NULL DEFAULT 0 CHECK (ai_generations_successful >= 0),
  automated_reminders_sent integer NOT NULL DEFAULT 0 CHECK (automated_reminders_sent >= 0),
  manual_email_reminders_sent integer NOT NULL DEFAULT 0 CHECK (manual_email_reminders_sent >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_workspace_entitlement_usage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_entitlement_usage_set_updated_at
  ON public.workspace_entitlement_usage;

CREATE TRIGGER workspace_entitlement_usage_set_updated_at
BEFORE UPDATE ON public.workspace_entitlement_usage
FOR EACH ROW EXECUTE FUNCTION public.set_workspace_entitlement_usage_updated_at();

ALTER TABLE public.workspace_entitlement_usage ENABLE ROW LEVEL SECURITY;

-- Trial lifecycle email idempotency (small contract for future wiring)
CREATE TABLE IF NOT EXISTS public.workspace_trial_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, event_key)
);

CREATE INDEX IF NOT EXISTS workspace_trial_lifecycle_events_workspace_idx
  ON public.workspace_trial_lifecycle_events (workspace_id, sent_at DESC);

ALTER TABLE public.workspace_trial_lifecycle_events ENABLE ROW LEVEL SECURITY;

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
  v_row public.workspace_entitlement_usage%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'amount must be >= 1' USING ERRCODE = '22023';
  END IF;

  IF p_resource NOT IN (
    'trial_invoices',
    'ai_generations',
    'automated_reminders',
    'manual_email_reminders'
  ) THEN
    RAISE EXCEPTION 'invalid resource: %', p_resource USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspace_entitlement_usage (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  IF p_resource = 'trial_invoices' THEN
    UPDATE public.workspace_entitlement_usage
    SET trial_invoices_created = trial_invoices_created + p_amount
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_row;
  ELSIF p_resource = 'ai_generations' THEN
    UPDATE public.workspace_entitlement_usage
    SET ai_generations_successful = ai_generations_successful + p_amount
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_row;
  ELSIF p_resource = 'automated_reminders' THEN
    UPDATE public.workspace_entitlement_usage
    SET automated_reminders_sent = automated_reminders_sent + p_amount
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.workspace_entitlement_usage
    SET manual_email_reminders_sent = manual_email_reminders_sent + p_amount
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_row;
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

REVOKE EXECUTE ON FUNCTION public.rpc_increment_entitlement_usage(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_increment_entitlement_usage(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_increment_entitlement_usage(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_increment_entitlement_usage(uuid, text, integer) TO service_role;

COMMENT ON FUNCTION public.rpc_increment_entitlement_usage(uuid, text, integer) IS
  'Atomically increments workspace entitlement usage counters for trial metering.';

-- Extend atomic billing RPC to preserve trial_consumed_at and avoid restarting trials.
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
  v_current_period_starts_at timestamptz;
  v_current_period_ends_at timestamptz;
  v_cancel_at_period_end boolean;
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

  SELECT ws.trial_consumed_at
  INTO v_trial_consumed_at
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id;

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
    CASE
      WHEN p_subscription_status = 'trial' AND v_trial_consumed_at IS NULL
        THEN COALESCE(p_trial_starts_at, now())
      ELSE v_trial_consumed_at
    END,
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

  IF v_subscription_plan IS NULL THEN
    RAISE EXCEPTION 'subscription row missing after upsert'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_subscription_plan IS DISTINCT FROM p_subscription_plan
     OR v_subscription_status IS DISTINCT FROM p_subscription_status THEN
    RAISE EXCEPTION 'subscription mismatch after upsert'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'workspace_id', p_workspace_id,
    'stored_plan', v_stored_plan,
    'subscription_plan', v_subscription_plan,
    'subscription_status', v_subscription_status,
    'payment_provider', v_payment_provider,
    'trial_starts_at', v_trial_starts_at,
    'trial_ends_at', v_trial_ends_at,
    'trial_consumed_at', v_trial_consumed_at,
    'plan_updated_at', v_plan_updated_at,
    'subscription_updated_at', v_subscription_updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid, text, integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid, text, integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid, text, integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_change_workspace_plan_atomic(
  uuid, text, integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean
) TO service_role;
