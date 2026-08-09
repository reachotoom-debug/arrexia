-- Recurring Overdue Chase V1: logical occurrence date for idempotency
-- scheduled_at = workspace-calendar date (YYYY-MM-DD) of the reminder occurrence,
-- distinct from sent_at (actual delivery timestamp).

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS scheduled_at date;

COMMENT ON COLUMN public.reminders.scheduled_at IS
  'Workspace-calendar logical occurrence date for rule-bound reminders; used for per-occurrence idempotency.';
