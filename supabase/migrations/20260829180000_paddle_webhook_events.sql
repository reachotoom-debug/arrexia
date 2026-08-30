-- Paddle webhook idempotency ledger (sandbox/production webhook processing).

CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz,
  status text NOT NULL CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  result text,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  provider_subscription_id text
);

CREATE INDEX IF NOT EXISTS paddle_webhook_events_provider_subscription_id_idx
  ON public.paddle_webhook_events (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

COMMENT ON TABLE public.paddle_webhook_events IS
  'Idempotency ledger for verified Paddle webhook events. Service-role writes only.';

ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
