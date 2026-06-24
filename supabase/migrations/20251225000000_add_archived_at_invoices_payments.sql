-- 01_add_archived_at_invoices_payments.sql

alter table public.invoices
  add column if not exists archived_at timestamptz null;

alter table public.payments
  add column if not exists archived_at timestamptz null;

create index if not exists invoices_workspace_archived_idx
  on public.invoices (workspace_id, archived_at);

create index if not exists payments_workspace_archived_idx
  on public.payments (workspace_id, archived_at);
