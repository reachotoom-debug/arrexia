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
