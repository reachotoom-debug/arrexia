import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH =
  "supabase/migrations/20260725100000_restrict_import_rpcs_to_service_role.sql";

const PRODUCTION_SIGNATURES = [
  "import_invoices_grouped(json,uuid,boolean)",
  "rpc_import_clients(uuid,jsonb)",
  "rpc_import_invoices(uuid,jsonb)",
  "rpc_import_payments(boolean,json,uuid)",
  "rpc_import_payments(uuid,jsonb)",
] as const;

const REPO_ONLY_SIGNATURES = [
  "import_invoices_grouped(uuid,jsonb,boolean)",
  "rpc_import_payments(uuid,jsonb,boolean)",
] as const;

function regprocedurePattern(signature: string): RegExp {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`to_regprocedure\\('public\\.${escaped}'\\)`, "i");
}

describe("import RPC migration signature contracts", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("A — migration protects all five known production signatures", () => {
    for (const signature of PRODUCTION_SIGNATURES) {
      assert.match(migration, regprocedurePattern(signature));
    }
  });

  it("B — migration uses conditional existence handling (to_regprocedure + DO block)", () => {
    assert.match(migration, /DO \$\$/);
    assert.match(migration, /to_regprocedure\(/);
    assert.match(migration, /IS NOT NULL THEN/);
    // No top-level unconditional REVOKE outside the DO block
    const outsideDo = migration.split("DO $$")[0];
    assert.doesNotMatch(outsideDo, /^REVOKE EXECUTE/m);
  });

  it("G — wrong import_invoices_grouped(uuid,jsonb) is not used unconditionally", () => {
    assert.doesNotMatch(migration, /import_invoices_grouped\s*\(\s*uuid\s*,\s*jsonb\s*\)/i);
    assert.doesNotMatch(
      migration,
      /^REVOKE EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb\)/im
    );
  });

  it("H — production import_invoices_grouped(json,uuid,boolean) is covered", () => {
    assert.match(migration, regprocedurePattern("import_invoices_grouped(json,uuid,boolean)"));
    assert.match(migration, /import_invoices_grouped\(json, uuid, boolean\)/);
  });

  it("I — production/live rpc_import_payments(boolean,json,uuid) is covered", () => {
    assert.match(migration, regprocedurePattern("rpc_import_payments(boolean,json,uuid)"));
  });

  it("J — rpc_import_payments(uuid,jsonb) is covered", () => {
    assert.match(migration, regprocedurePattern("rpc_import_payments(uuid,jsonb)"));
  });

  it("repo-only signatures are protected conditionally", () => {
    for (const signature of REPO_ONLY_SIGNATURES) {
      assert.match(migration, regprocedurePattern(signature));
    }
  });

  it("documents proacl = NULL / PUBLIC default EXECUTE risk", () => {
    assert.match(migration, /proacl = NULL|PUBLIC by default/i);
  });

  for (const signature of [...PRODUCTION_SIGNATURES, ...REPO_ONLY_SIGNATURES]) {
    it(`C–F — ${signature}: PUBLIC/anon/authenticated revoked and service_role granted via EXECUTE`, () => {
      assert.match(migration, regprocedurePattern(signature));
      assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${signature.replace(/,/g, ",\\s*").replace(/\(/g, "\\(").replace(/\)/g, "\\)")} FROM PUBLIC`, "i"));
      assert.match(migration, new RegExp(`FROM anon`, "i"));
      assert.match(migration, new RegExp(`FROM authenticated`, "i"));
      assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/,/g, ",\\s*").replace(/\(/g, "\\(").replace(/\)/g, "\\)")} TO service_role`, "i"));
    });
  }

  it("K — live payment action continues named-arg RPC call", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    const executeBlock = src.slice(src.indexOf("export async function executePaymentsImport"));
    assert.match(executeBlock, /p_workspace_id:\s*workspaceId/);
    assert.match(executeBlock, /p_dry_run:\s*false/);
    assert.match(executeBlock, /p_rows:\s*rowsJsonb/);
    assert.match(executeBlock, /supabaseAdmin\(\)\.rpc\("rpc_import_payments"/);
  });

  it("L — live execute import actions use requireWorkspace before supabaseAdmin RPC", () => {
    const liveImportActions = {
      clients: {
        path: "app/[workspaceId]/settings/import/actions/clients.ts",
        rpc: "rpc_import_clients",
        executeFn: "executeClientsImport",
      },
      payments: {
        path: "app/[workspaceId]/settings/import/actions/payments.ts",
        rpc: "rpc_import_payments",
        executeFn: "executePaymentsImport",
      },
      invoices: {
        path: "app/[workspaceId]/settings/import/actions/invoices.ts",
        rpc: "import_invoices_grouped",
        executeFn: "executeInvoicesImport",
      },
    };

    for (const { path, rpc, executeFn } of Object.values(liveImportActions)) {
      const src = readFileSync(path, "utf8");
      const executeBlock = src.slice(src.indexOf(`export async function ${executeFn}`));
      const requireIdx = executeBlock.indexOf("requireWorkspace(workspaceId)");
      const rpcIdx = executeBlock.indexOf("supabaseAdmin().rpc");
      assert.ok(requireIdx >= 0, `${executeFn} missing requireWorkspace`);
      assert.ok(rpcIdx >= 0, `${executeFn} missing supabaseAdmin().rpc`);
      assert.ok(requireIdx < rpcIdx, `${executeFn} must requireWorkspace before RPC`);
      assert.match(executeBlock, new RegExp(`["']${rpc}["']|rpcName = "${rpc}"`));
      assert.doesNotMatch(executeBlock, /supabaseServer\(\)\.rpc/);
    }
  });

  it("rpc_import_invoices is not called by live application code", () => {
    for (const file of [
      "app/[workspaceId]/settings/import/actions/clients.ts",
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "app/[workspaceId]/settings/import/actions/invoices.ts",
    ]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /rpc_import_invoices/);
    }
  });
});

describe("160000 invoice import RPC consolidation", () => {
  const migration = readFileSync(
    "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
    "utf8"
  );
  const migration150 = readFileSync(
    "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
    "utf8"
  );
  const invoicesAction = readFileSync(
    "app/[workspaceId]/settings/import/actions/invoices.ts",
    "utf8"
  );

  it("150000 rename is conditional and can leave production without internal implementation", () => {
    assert.match(
      migration150,
      /IF to_regprocedure\('public\.import_invoices_grouped\(uuid,jsonb,boolean\)'\) IS NOT NULL[\s\S]*RENAME TO internal_import_invoices_grouped;/
    );
    assert.match(migration, /\$preserve_internal\$/);
    assert.match(migration, /\$install_canonical_internal\$/);
  });

  it("creates or preserves internal mutation implementation before legacy drop and public wrapper", () => {
    const preserveIdx = migration.indexOf("DO $preserve_internal$");
    const installIdx = migration.indexOf("DO $install_canonical_internal$");
    const verifyIdx = migration.indexOf("DO $verify_internal_import$");
    const dropLegacyIdx = migration.indexOf(
      "DROP FUNCTION IF EXISTS public.import_invoices_grouped(json, uuid, boolean);"
    );
    const publicWrapperIdx = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.import_invoices_grouped(\n  p_workspace_id uuid,\n  p_rows jsonb,"
    );

    assert.ok(preserveIdx >= 0);
    assert.ok(installIdx > preserveIdx);
    assert.ok(verifyIdx > installIdx);
    assert.ok(dropLegacyIdx > verifyIdx);
    assert.ok(publicWrapperIdx > dropLegacyIdx);
  });

  it("does not grant internal RPC before verifying it exists", () => {
    const verifyIdx = migration.indexOf("DO $verify_internal_import$");
    const internalGrantIdx = migration.indexOf(
      "GRANT EXECUTE ON FUNCTION public.internal_import_invoices_grouped(uuid, jsonb, boolean) TO service_role;"
    );
    assert.ok(verifyIdx >= 0);
    assert.ok(internalGrantIdx > verifyIdx);
  });

  it("installs canonical internal body only when internal is still missing", () => {
    assert.match(
      migration,
      /DO \$install_canonical_internal\$[\s\S]*IF to_regprocedure\('public\.internal_import_invoices_grouped\(uuid,jsonb,boolean\)'\) IS NOT NULL THEN[\s\S]*RETURN;[\s\S]*CREATE OR REPLACE FUNCTION public\.internal_import_invoices_grouped\(/
    );
  });

  it("drops legacy json,uuid,boolean overload without CASCADE", () => {
    assert.match(
      migration,
      /DROP FUNCTION IF EXISTS public\.import_invoices_grouped\(json, uuid, boolean\);/
    );
    assert.doesNotMatch(migration, /DROP FUNCTION IF EXISTS public\.import_invoices_grouped\(json, uuid, boolean\) CASCADE/);
  });

  it("defines exactly one canonical public import_invoices_grouped(uuid,jsonb,boolean)", () => {
    const matches = migration.match(
      /CREATE OR REPLACE FUNCTION public\.import_invoices_grouped\(\s*p_workspace_id uuid,\s*p_rows jsonb,\s*p_dry_run boolean/g
    );
    assert.ok(matches);
    assert.equal(matches?.length, 1);
  });

  it("canonical RPC calls entitlement preflight only on execute (not dry_run)", () => {
    assert.match(migration, /COALESCE\(p_dry_run, true\) IS NOT TRUE/);
    assert.match(
      migration,
      /PERFORM public\.internal_import_entitlement_preflight\(p_workspace_id, 0, v_new_invoices\);/
    );
    assert.match(
      migration,
      /RETURN public\.internal_import_invoices_grouped\(p_workspace_id, p_rows, p_dry_run\);/
    );
  });

  it("does not embed standalone legacy invoice mutation logic in 160000 public wrapper", () => {
    const wrapperMatch = migration.match(
      /CREATE OR REPLACE FUNCTION public\.import_invoices_grouped\(\s*p_workspace_id uuid,\s*p_rows jsonb[\s\S]*?\$\$;/
    );
    assert.ok(wrapperMatch, "expected canonical import_invoices_grouped wrapper in 160000");
    const wrapperBody = wrapperMatch[0];
    assert.doesNotMatch(wrapperBody, /INSERT INTO public\.invoices/);
    assert.doesNotMatch(wrapperBody, /UPDATE public\.invoices/);
  });

  it("preserves mutation implementation in internal_import_invoices_grouped", () => {
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION public\.internal_import_invoices_grouped\([\s\S]*INSERT INTO invoices \([\s\S]*ON CONFLICT \(workspace_id, invoice_number\)/
    );
    assert.match(migration, /Duplicate invoice_number in file/);
  });

  it("uses rerunnable IF EXISTS / guarded DO semantics for production upgrade", () => {
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.import_invoices_grouped\(json, uuid, boolean\);/);
    assert.match(migration, /IF to_regprocedure\('public\.internal_import_invoices_grouped\(uuid,jsonb,boolean\)'\) IS NOT NULL THEN/);
    assert.doesNotMatch(migration, /DROP FUNCTION IF EXISTS public\.import_invoices_grouped\(json, uuid, boolean\) CASCADE/);
  });

  it("restricts canonical and internal import RPCs to service_role", () => {
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb, boolean\) FROM PUBLIC;/
    );
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb, boolean\) FROM authenticated;/
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb, boolean\) TO service_role;/
    );
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) FROM authenticated;/
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) TO service_role;/
    );
  });

  it("application uses named parameters matching canonical uuid,jsonb,boolean signature", () => {
    assert.match(invoicesAction, /p_workspace_id:\s*workspaceId/);
    assert.match(invoicesAction, /p_rows:\s*(rpcRows|rawRows)/);
    assert.match(invoicesAction, /p_dry_run:\s*(dryRun|true|false)/);
    assert.match(
      invoicesAction,
      /const rpcName = "import_invoices_grouped"|supabaseAdmin\(\)\.rpc\("import_invoices_grouped"/
    );
    assert.match(invoicesAction, /supabaseAdmin\(\)\.rpc\(rpcName,/);
  });

  it("dry-run preview path sets p_dry_run true", () => {
    const previewBlock = invoicesAction.slice(
      invoicesAction.indexOf("export async function previewInvoicesImport"),
      invoicesAction.indexOf("export async function executeInvoicesImport")
    );
    assert.match(previewBlock, /const dryRun = true/);
    assert.match(previewBlock, /p_dry_run:\s*dryRun/);
  });

  it("execute path sets p_dry_run false", () => {
    const executeBlock = invoicesAction.slice(
      invoicesAction.indexOf("export async function executeInvoicesImport")
    );
    assert.match(executeBlock, /const dryRun = false/);
    assert.match(executeBlock, /p_dry_run:\s*dryRun/);
  });
});
