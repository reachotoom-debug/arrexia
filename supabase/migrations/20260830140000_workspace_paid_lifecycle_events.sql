-- Paid subscription lifecycle email idempotency (separate from paddle_webhook_events)
CREATE TABLE IF NOT EXISTS public.workspace_paid_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_subscription_id text NOT NULL,
  event_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_subscription_id, event_key)
);

CREATE INDEX IF NOT EXISTS workspace_paid_lifecycle_events_workspace_idx
  ON public.workspace_paid_lifecycle_events (workspace_id, sent_at DESC);

ALTER TABLE public.workspace_paid_lifecycle_events ENABLE ROW LEVEL SECURITY;
