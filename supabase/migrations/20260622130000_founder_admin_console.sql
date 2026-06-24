-- Founder admin console: admin users, audit logs, workspace subscriptions

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'support', 'analyst')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_user_id_key ON public.admin_users (user_id);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'pro')),
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  payment_provider text NOT NULL DEFAULT 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_subscriptions_status_idx
  ON public.workspace_subscriptions (status);

CREATE INDEX IF NOT EXISTS workspace_subscriptions_trial_ends_at_idx
  ON public.workspace_subscriptions (trial_ends_at);

CREATE INDEX IF NOT EXISTS workspace_subscriptions_current_period_ends_at_idx
  ON public.workspace_subscriptions (current_period_ends_at);

-- Backfill subscriptions from existing workspace plans
INSERT INTO public.workspace_subscriptions (
  workspace_id,
  status,
  plan,
  trial_starts_at,
  trial_ends_at,
  current_period_starts_at,
  current_period_ends_at,
  payment_provider
)
SELECT
  wp.workspace_id,
  CASE
    WHEN wp.plan IN ('starter', 'pro') THEN 'active'
    ELSE 'trial'
  END,
  wp.plan,
  w.created_at,
  CASE
    WHEN wp.plan = 'free' THEN w.created_at + interval '14 days'
    ELSE NULL
  END,
  CASE
    WHEN wp.plan IN ('starter', 'pro') THEN w.created_at
    ELSE NULL
  END,
  CASE
    WHEN wp.plan IN ('starter', 'pro') THEN w.created_at + interval '30 days'
    ELSE NULL
  END,
  'manual'
FROM public.workspace_plans wp
JOIN public.workspaces w ON w.id = wp.workspace_id
ON CONFLICT (workspace_id) DO NOTHING;

-- RLS: enabled, no client policies (service role only)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
