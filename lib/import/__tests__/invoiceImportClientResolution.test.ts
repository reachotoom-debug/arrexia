import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CLIENT_RESOLUTION_MIGRATION_PATH =
  "supabase/migrations/20260823150000_invoice_import_no_client_auto_create.sql";
const PAID_TOTAL_MIGRATION_PATH =
  "supabase/migrations/20260817120000_invoice_import_paid_total_guard.sql";
const INTEGRATION_SQL_PATH =
  "scripts/db/importInvoicesGroupedIntegrity.integration.sql";
const INVOICES_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/invoices.ts";

function readInternalRpcBody(migrationPath: string): string {
  const migration = readFileSync(migrationPath, "utf8");
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped("
  );
  const end = migration.indexOf("$func$;", start);
  assert.ok(start >= 0 && end > start, `expected internal RPC in ${migrationPath}`);
  return migration.slice(start, end);
}

describe("invoice import client resolution migration contract", () => {
  const migration = readFileSync(CLIENT_RESOLUTION_MIGRATION_PATH, "utf8");
  const internalRpc = readInternalRpcBody(CLIENT_RESOLUTION_MIGRATION_PATH);

  it("10 — authoritative RPC contains no client INSERT/auto-create path", () => {
    assert.doesNotMatch(internalRpc, /INSERT INTO public\.clients/);
    assert.doesNotMatch(internalRpc, /v_created_clients := v_created_clients \+ 1/);
    assert.match(internalRpc, /Client resolution \(dry-run \+ execute\): existing active workspace clients only/);
    assert.match(internalRpc, /Client not found for %s/);
    assert.match(internalRpc, /archived_at IS NULL/);
  });

  it("validates client resolution before dry-run return", () => {
    const dryRunIdx = internalRpc.indexOf("IF p_dry_run THEN");
    const clientResolutionIdx = internalRpc.indexOf(
      "Client resolution (dry-run + execute)"
    );
    assert.ok(clientResolutionIdx >= 0 && dryRunIdx > clientResolutionIdx);
    assert.match(
      internalRpc.slice(clientResolutionIdx, dryRunIdx),
      /IF jsonb_array_length\(v_errors\) > 0 THEN[\s\S]*RETURN jsonb_build_object\([\s\S]*'ok', false/
    );
  });

  it("execute path fails missing clients without creating replacements", () => {
    const executeIdx = internalRpc.indexOf("-- Execute: invoice headers first");
    const executeSection = internalRpc.slice(executeIdx);
    assert.doesNotMatch(executeSection, /INSERT INTO public\.clients/);
    assert.match(
      executeSection,
      /IF v_client_count > 1 THEN[\s\S]*Multiple clients match name/
    );
    assert.match(
      executeSection,
      /IF v_client_id IS NULL THEN[\s\S]*Client not found for %s/
    );
  });

  it("preserves paid-total guard from prior migration", () => {
    const prior = readInternalRpcBody(PAID_TOTAL_MIGRATION_PATH);
    assert.match(internalRpc, /Paid-total guard/);
    assert.match(internalRpc, /v_effective_paid > v_new_total \+ v_paid_total_tolerance/);
    assert.match(prior, /v_effective_paid > v_new_total \+ v_paid_total_tolerance/);
  });

  it("preserves batch rollback, item replacement, and amount recompute", () => {
    assert.match(internalRpc, /RAISE EXCEPTION 'invoice_import_failed'/);
    assert.match(internalRpc, /DELETE FROM public\.invoice_items WHERE invoice_id/);
    assert.match(internalRpc, /SET amount = v_subtotal/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
  });
});

describe("invoice import client resolution integration scenarios", () => {
  const integrationSql = readFileSync(INTEGRATION_SQL_PATH, "utf8");

  it("1 — existing active workspace client import scenario remains", () => {
    assert.match(integrationSql, /client_email', 'acme@example.com'/);
    assert.match(integrationSql, /PERFORM public\.internal_import_invoices_grouped\(v_workspace_id, v_rows, false\)/);
  });

  it("2 — missing client dry-run and execute fail with zero writes", () => {
    assert.match(integrationSql, /INV-MISSING-CLIENT/);
    assert.match(integrationSql, /missing-client dry-run rejects/);
    assert.match(integrationSql, /missing-client execute leaves zero invoices/);
  });

  it("3 — archived client fails resolution", () => {
    assert.match(integrationSql, /INV-ARCHIVED-CLIENT/);
    assert.match(integrationSql, /archived client fails/);
  });

  it("4 — cross-workspace client reference fails", () => {
    assert.match(integrationSql, /INV-CROSS-WORKSPACE-CLIENT/);
    assert.match(integrationSql, /cross-workspace client reference fails/);
  });

  it("5 — client removed between dry-run and execute fails atomically", () => {
    assert.match(integrationSql, /INV-CLIENT-RACE/);
    assert.match(integrationSql, /client removed between dry-run and execute/);
  });

  it("6-7 — failed resolution creates zero clients/invoices/items", () => {
    assert.match(integrationSql, /v_client_count_before/);
    assert.match(integrationSql, /zero clients created on missing-client failure/);
    assert.match(integrationSql, /missing-client execute leaves zero invoices/);
    assert.match(integrationSql, /zero invoices\/items created on missing-client failure/);
  });

  it("8 — mixed insert/update batch atomicity scenario unchanged", () => {
    assert.match(integrationSql, /INV-ATOMIC-OK/);
    assert.match(integrationSql, /soft failure left earlier invoice committed/);
  });
});

describe("invoice import preview contract alignment", () => {
  const actionsSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");

  it("preview still requires existing workspace clients", () => {
    assert.match(actionsSrc, /Client not found in this workspace/);
    assert.match(actionsSrc, /Import client first \(Clients tab\)/);
    assert.match(actionsSrc, /newClients: 0/);
  });
});
