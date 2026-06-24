-- Force replace invoices import RPC (safe re-deploy)
drop function if exists public.rpc_import_invoices(uuid, jsonb);

-- (Paste your CREATE OR REPLACE FUNCTION public.rpc_import_invoices(...) here)
-- Keep the unique index line too if you want, but it already exists:
create unique index if not exists invoices_workspace_invoice_number_unique
on public.invoices (workspace_id, invoice_number)
where archived_at is null;
