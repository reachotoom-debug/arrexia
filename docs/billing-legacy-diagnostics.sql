-- ARREXIA billing legacy diagnostics (read-only)
-- Phase 1: identify stored/effective divergence candidates before Lemon Squeezy.
-- Do not run UPDATE/DELETE statements in production without founder review.

-- ---------------------------------------------------------------------------
-- 1) Divergence candidates: stored paid plan + trial subscription past end
-- ---------------------------------------------------------------------------
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  wp.plan AS stored_plan,
  ws.status AS subscription_status,
  ws.plan AS subscription_plan,
  ws.trial_starts_at,
  ws.trial_ends_at,
  ws.current_period_starts_at,
  ws.current_period_ends_at,
  ws.payment_provider,
  CASE
    WHEN ws.status = 'trial'
      AND ws.trial_ends_at IS NOT NULL
      AND ws.trial_ends_at <= NOW()
      AND wp.plan IN ('starter', 'pro')
      THEN 'expired_trial_overrides_stored_paid'
    WHEN ws.status = 'trial'
      AND ws.trial_ends_at IS NULL
      AND wp.plan IN ('starter', 'pro')
      THEN 'missing_trial_end_on_paid_stored'
    WHEN ws.id IS NULL
      AND wp.plan IN ('starter', 'pro')
      THEN 'stored_paid_without_subscription'
    ELSE 'review'
  END AS divergence_reason
FROM workspaces w
JOIN workspace_plans wp ON wp.workspace_id = w.id
LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.id
WHERE
  wp.plan IN ('starter', 'pro')
  AND (
    ws.id IS NULL
    OR (
      ws.status = 'trial'
      AND (
        ws.trial_ends_at IS NULL
        OR ws.trial_ends_at <= NOW()
      )
    )
  )
ORDER BY divergence_reason, w.created_at DESC;

-- ---------------------------------------------------------------------------
-- 2) Known account emails (read-only)
-- ---------------------------------------------------------------------------
SELECT
  u.email,
  w.id AS workspace_id,
  w.name AS workspace_name,
  wm.role AS membership_role,
  wp.plan AS stored_plan,
  ws.status AS subscription_status,
  ws.plan AS subscription_plan,
  ws.trial_ends_at,
  ws.current_period_ends_at,
  CASE
    WHEN ws.status = 'active' THEN ws.plan
    WHEN ws.status = 'trial'
      AND ws.trial_ends_at IS NOT NULL
      AND ws.trial_ends_at > NOW()
      THEN COALESCE(NULLIF(wp.plan, 'free'), ws.plan)
    WHEN ws.status = 'trial'
      AND (ws.trial_ends_at IS NULL OR ws.trial_ends_at <= NOW())
      AND wp.plan IN ('starter', 'pro')
      THEN 'free_effective_despite_stored_paid'
    WHEN ws.id IS NULL THEN wp.plan
    ELSE 'free'
  END AS approximate_effective_plan
FROM auth.users u
JOIN workspace_members wm ON wm.user_id = u.id
JOIN workspaces w ON w.id = wm.workspace_id
LEFT JOIN workspace_plans wp ON wp.workspace_id = w.id
LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.id
WHERE lower(u.email) IN (
  lower('mohammed.otoom@gmail.com'),
  lower('reachotoom@gmail.com'),
  lower('ics9@hotmail.com'),
  lower('arrexia@tutamail.com'),
  lower('mohammedotoom970@yahoo.com')
)
ORDER BY u.email, w.created_at;

-- ---------------------------------------------------------------------------
-- 3) Controlled repair approach (manual — do not auto-run)
-- ---------------------------------------------------------------------------
-- Preferred: founder admin assigns the intended plan again via admin UI.
-- That path now routes through changeWorkspacePlan with founder_admin source,
-- which synchronizes workspace_plans and workspace_subscriptions and verifies
-- effective entitlement before reporting success.
--
-- Alternative (reviewed SQL, one workspace at a time):
--   1. Confirm row in query (1) or (2) for the workspace_id.
--   2. Use founder admin "Change plan" to target Starter or Pro (reactivation).
--   3. Re-run query (2) and confirm subscription_status = 'active',
--      payment_provider = 'manual', and approximate_effective_plan matches target.
--
-- No broad migration is recommended until exact affected rows are confirmed.
