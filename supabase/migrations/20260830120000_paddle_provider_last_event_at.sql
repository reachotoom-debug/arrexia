-- Track the most recently applied Paddle subscription lifecycle webhook by occurred_at.

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS provider_last_event_at timestamptz;

COMMENT ON COLUMN public.workspace_subscriptions.provider_last_event_at IS
  'occurred_at of the latest successfully applied Paddle subscription lifecycle webhook (not transaction.completed).';

CREATE INDEX IF NOT EXISTS workspace_subscriptions_provider_last_event_at_idx
  ON public.workspace_subscriptions (provider_last_event_at)
  WHERE provider_last_event_at IS NOT NULL;
