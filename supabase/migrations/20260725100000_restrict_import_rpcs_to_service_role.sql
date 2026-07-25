-- Launch blocker (P0): SECURITY DEFINER import RPCs must not be executable by
-- PUBLIC / anon / authenticated. App layer calls via supabaseAdmin() after
-- requireWorkspace().
--
-- PostgreSQL note: functions normally grant EXECUTE to PUBLIC by default.
-- SECURITY DEFINER import functions with proacl = NULL must therefore be
-- treated as potentially PUBLIC-executable until explicitly revoked here.
--
-- Production pg_proc signatures (2026-07-25):
--   public.import_invoices_grouped(json, uuid, boolean)
--   public.rpc_import_clients(uuid, jsonb)
--   public.rpc_import_invoices(uuid, jsonb)
--   public.rpc_import_payments(boolean, json, uuid)
--   public.rpc_import_payments(uuid, jsonb)
--
-- Repository-only signatures that may exist on migration-built databases:
--   public.import_invoices_grouped(uuid, jsonb, boolean)
--   public.rpc_import_payments(uuid, jsonb, boolean)
--
-- Conditional handling: skip signatures absent on the target database so deploy
-- does not abort when production and migration-built schemas diverge.

DO $$
BEGIN
  -- Production: import_invoices_grouped(json, uuid, boolean)
  IF to_regprocedure('public.import_invoices_grouped(json,uuid,boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(json, uuid, boolean) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(json, uuid, boolean) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(json, uuid, boolean) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.import_invoices_grouped(json, uuid, boolean) TO service_role';
  END IF;

  -- Repo/fresh-DB: import_invoices_grouped(uuid, jsonb, boolean)
  IF to_regprocedure('public.import_invoices_grouped(uuid,jsonb,boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.import_invoices_grouped(uuid, jsonb, boolean) TO service_role';
  END IF;

  -- rpc_import_clients(uuid, jsonb)
  IF to_regprocedure('public.rpc_import_clients(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_clients(uuid, jsonb) TO service_role';
  END IF;

  -- rpc_import_invoices(uuid, jsonb)
  IF to_regprocedure('public.rpc_import_invoices(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_invoices(uuid, jsonb) TO service_role';
  END IF;

  -- Production legacy/live: rpc_import_payments(boolean, json, uuid)
  IF to_regprocedure('public.rpc_import_payments(boolean,json,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(boolean, json, uuid) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(boolean, json, uuid) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(boolean, json, uuid) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_payments(boolean, json, uuid) TO service_role';
  END IF;

  -- rpc_import_payments(uuid, jsonb)
  IF to_regprocedure('public.rpc_import_payments(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb) TO service_role';
  END IF;

  -- Repo legacy: rpc_import_payments(uuid, jsonb, boolean)
  IF to_regprocedure('public.rpc_import_payments(uuid,jsonb,boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_import_payments(uuid, jsonb, boolean) TO service_role';
  END IF;
END
$$;
