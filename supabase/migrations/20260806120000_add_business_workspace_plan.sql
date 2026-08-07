-- Allow Business as a persisted self-service paid tier.
-- Enterprise remains outside stored plan constraints (Contact Sales only).

ALTER TABLE public.workspace_plans
  DROP CONSTRAINT IF EXISTS workspace_plans_plan_check;

ALTER TABLE public.workspace_plans
  ADD CONSTRAINT workspace_plans_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));

ALTER TABLE public.workspace_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_subscriptions_plan_check;

ALTER TABLE public.workspace_subscriptions
  ADD CONSTRAINT workspace_subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));
