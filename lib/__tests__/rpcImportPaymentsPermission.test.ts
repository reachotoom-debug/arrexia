import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PERMISSION_MIGRATION =
  "supabase/migrations/20260816130000_rpc_import_payments_permission_hardening.sql";
const OVERPAY_MIGRATION =
  "supabase/migrations/20260816120000_rpc_import_payments_overpay_guard.sql";
const CANONICAL_SIGNATURE = "rpc_import_payments(uuid,jsonb,boolean)";

function signatureRevokePattern(signature: string, target: string): RegExp {
  const escaped = signature
    .replace(/,/g, ",\\s*")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return new RegExp(
    `REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${escaped} FROM ${target}`,
    "i"
  );
}

describe("rpc_import_payments permission hardening", () => {
  const permissionMigration = readFileSync(PERMISSION_MIGRATION, "utf8");
  const overpayMigration = readFileSync(OVERPAY_MIGRATION, "utf8");

  it("canonical 3-arg overload permission migration exists after overpay guard", () => {
    assert.match(PERMISSION_MIGRATION, /20260816130000_rpc_import_payments_permission_hardening\.sql$/);
    assert.match(
      permissionMigration,
      /to_regprocedure\('public\.rpc_import_payments\(uuid,jsonb,boolean\)'\)/
    );
  });

  it("canonical overload is SECURITY DEFINER with hardened search_path", () => {
    assert.match(overpayMigration, /CREATE OR REPLACE FUNCTION public\.rpc_import_payments\(/);
    assert.match(overpayMigration, /SECURITY DEFINER/);
    assert.match(overpayMigration, /SET search_path = public/);
  });

  it("canonical overload retains overpay guard", () => {
    assert.match(overpayMigration, /Payment exceeds invoice outstanding balance/);
    assert.match(overpayMigration, /_payment_import_capacity/);
    assert.match(overpayMigration, /FOR UPDATE/);
  });

  it("service_role granted EXECUTE on canonical overload", () => {
    assert.match(
      permissionMigration,
      /GRANT EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) TO service_role/i
    );
  });

  it("authenticated cannot execute canonical overload", () => {
    assert.match(
      permissionMigration,
      signatureRevokePattern(CANONICAL_SIGNATURE, "authenticated")
    );
    assert.doesNotMatch(
      permissionMigration,
      /GRANT EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) TO authenticated/i
    );
  });

  it("anon cannot execute canonical overload", () => {
    assert.match(
      permissionMigration,
      signatureRevokePattern(CANONICAL_SIGNATURE, "anon")
    );
    assert.doesNotMatch(
      permissionMigration,
      /GRANT EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) TO anon/i
    );
  });

  it("PUBLIC cannot execute canonical overload", () => {
    assert.match(
      permissionMigration,
      /REVOKE ALL ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) FROM PUBLIC/i
    );
  });

  it("obsolete legacy overloads are dropped", () => {
    assert.match(
      permissionMigration,
      /DROP FUNCTION IF EXISTS public\.rpc_import_payments\(boolean, json, uuid\);/
    );
    assert.match(
      permissionMigration,
      /DROP FUNCTION IF EXISTS public\.rpc_import_payments\(uuid, jsonb\);/
    );
    assert.doesNotMatch(permissionMigration, /CASCADE/i);
  });

  it("permission migration does not replace guarded function body", () => {
    assert.doesNotMatch(permissionMigration, /CREATE OR REPLACE FUNCTION public\.rpc_import_payments/);
  });

  it("documents incorrect production ACL must be explicitly hardened", () => {
    assert.match(
      permissionMigration,
      /Exact historical ACL origin cannot be proven[\s\S]*incorrect and must be explicitly hardened/i
    );
    assert.match(permissionMigration, /CREATE OR REPLACE preserves/i);
    assert.doesNotMatch(
      permissionMigration,
      /regained default PUBLIC EXECUTE/i
    );
  });
});

describe("rpc_import_payments runtime callers", () => {
  it("application only references canonical overload via named args", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    const executeBlock = src.slice(
      src.indexOf("export async function executePaymentsImport")
    );

    assert.match(executeBlock, /supabaseAdmin\(\)\.rpc\("rpc_import_payments"/);
    assert.match(executeBlock, /p_workspace_id:\s*workspaceId/);
    assert.match(executeBlock, /p_dry_run:\s*false/);
    assert.match(executeBlock, /p_rows:\s*rowsJsonb/);
    assert.doesNotMatch(executeBlock, /supabaseServer\(\)\.rpc\("rpc_import_payments"/);
  });

  it("no other application .rpc rpc_import_payments call sites", () => {
    const paymentsAction = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    const matches = paymentsAction.match(/rpc_import_payments/g) ?? [];
    assert.ok(matches.length >= 1);
    assert.equal(
      (readFileSync("app/[workspaceId]/settings/import/actions/clients.ts", "utf8").match(
        /\.rpc\([\"']rpc_import_payments/
      ) ?? []).length,
      0
    );
    assert.equal(
      (readFileSync("app/[workspaceId]/settings/import/actions/invoices.ts", "utf8").match(
        /\.rpc\([\"']rpc_import_payments/
      ) ?? []).length,
      0
    );
  });
});
