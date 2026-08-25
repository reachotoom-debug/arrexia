import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { validateInvoiceGroupsForExecute } from "../invoiceImportExecuteValidation";
import type { InvoiceGroupPayload } from "@/app/[workspaceId]/settings/import/_lib/invoicesGroupedFormat";

const HARDENING_MIGRATION_PATH =
  "supabase/migrations/20260825150000_invoice_import_financial_hardening.sql";
const CLIENT_RESOLUTION_MIGRATION_PATH =
  "supabase/migrations/20260823150000_invoice_import_no_client_auto_create.sql";
const INVOICES_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/invoices.ts";
const INTEGRATION_SQL_PATH =
  "scripts/db/importInvoicesGroupedIntegrity.integration.sql";

function readInternalRpcBody(migrationPath: string): string {
  const migration = readFileSync(migrationPath, "utf8");
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped("
  );
  const end = migration.indexOf("$func$;", start);
  assert.ok(start >= 0 && end > start, `expected internal RPC in ${migrationPath}`);
  return migration.slice(start, end);
}

function sampleGroup(
  overrides: Partial<InvoiceGroupPayload> & {
    items?: InvoiceGroupPayload["items"];
  } = {}
): InvoiceGroupPayload {
  return {
    rowId: "row-1",
    invoice_number: "INV-100",
    client_name: "Acme",
    issue_date: "2026-01-01",
    due_date: "2026-02-01",
    base_status: "sent",
    items: [{ description: "Line", quantity: 2, unit_price: 50, amount: 100 }],
    ...overrides,
  };
}

describe("invoice import financial hardening migration", () => {
  const internalRpc = readInternalRpcBody(HARDENING_MIGRATION_PATH);

  it("IMP-001 — execute locks public.invoices FOR UPDATE before paid-floor and mutations", () => {
    const executeLockSection = internalRpc.slice(
      internalRpc.indexOf("-- IMP-001: execute — lock existing re-import invoices"),
      internalRpc.indexOf("-- Execute: invoice headers first")
    );
    assert.match(executeLockSection, /ORDER BY 1/);
    assert.match(executeLockSection, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
    assert.match(
      executeLockSection,
      /v_effective_paid > v_new_total \+ v_paid_total_tolerance/
    );
    assert.match(executeLockSection, /COALESCE\(p\.net_amount, p\.amount\)/);
    assert.doesNotMatch(executeLockSection, /DELETE FROM public\.invoice_items/);
  });

  it("IMP-001 — dry-run paid-floor remains unlocked and non-mutating", () => {
    const dryRunSection = internalRpc.slice(
      internalRpc.indexOf("IF p_dry_run THEN"),
      internalRpc.indexOf("-- IMP-001: execute — lock existing re-import invoices")
    );
    assert.match(dryRunSection, /Paid-total guard \(preview only; no row lock/);
    assert.doesNotMatch(dryRunSection, /FOR UPDATE/);
    assert.match(dryRunSection, /RETURN jsonb_build_object\([\s\S]*'ok', true/);
  });

  it("IMP-001 — execute lock ordering is deterministic before header mutations", () => {
    const lockIdx = internalRpc.indexOf("-- IMP-001: execute — lock existing re-import invoices");
    const headerIdx = internalRpc.indexOf("-- Execute: invoice headers first");
    assert.ok(lockIdx >= 0 && headerIdx > lockIdx);
    assert.match(
      internalRpc.slice(lockIdx, headerIdx),
      /RETURN jsonb_build_object\([\s\S]*'ok', false/
    );
  });

  it("IMP-002 — RPC rejects non-positive quantity and unit_price", () => {
    assert.match(internalRpc, /v_quantity <= 0/);
    assert.match(internalRpc, /v_unit_price <= 0/);
    assert.match(internalRpc, /Quantity must be greater than zero/);
    assert.match(internalRpc, /Unit price must be greater than zero/);
    assert.match(internalRpc, /Invalid quantity for %s \(must be a positive number\)/);
    assert.match(internalRpc, /must have a positive total \(sum of line items\)/);
    assert.match(internalRpc, /Line amount must be greater than zero/);
  });

  it("IMP-002 — line validation runs before any execute mutations", () => {
    const positiveTotalIdx = internalRpc.indexOf(
      "-- IMP-002: each invoice must have a positive imported total"
    );
    const executeLockIdx = internalRpc.indexOf(
      "-- IMP-001: execute — lock existing re-import invoices"
    );
    assert.ok(positiveTotalIdx >= 0 && executeLockIdx > positiveTotalIdx);
  });

  it("preserves no-client-auto-create behavior", () => {
    const clientResolution = readInternalRpcBody(CLIENT_RESOLUTION_MIGRATION_PATH);
    assert.doesNotMatch(internalRpc, /INSERT INTO public\.clients/);
    assert.match(internalRpc, /Client not found for %s/);
    assert.doesNotMatch(clientResolution, /INSERT INTO public\.clients/);
  });

  it("preserves SECURITY DEFINER and hardened search_path", () => {
    const migration = readFileSync(HARDENING_MIGRATION_PATH, "utf8");
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.import_invoices_grouped/);
  });

  it("restricts internal_import_invoices_grouped to service_role only", () => {
    const migration = readFileSync(HARDENING_MIGRATION_PATH, "utf8");
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) FROM PUBLIC;/
    );
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) FROM anon;/
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

  it("serializes on same public.invoices row as manual payment RPCs", () => {
    const paymentCreateMigration = readFileSync(
      "supabase/migrations/20260825120000_rpc_create_payment_manual.sql",
      "utf8"
    );
    assert.match(paymentCreateMigration, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
    assert.match(internalRpc, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
  });
});

describe("invoice import execute validation (server-side)", () => {
  it("4 — crafted quantity = 0 is rejected", () => {
    const errors = validateInvoiceGroupsForExecute([
      sampleGroup({
        items: [{ description: "Line", quantity: 0, unit_price: 10, amount: 0 }],
      }),
    ]);
    assert.ok(errors.some((e) => e.includes("quantity must be greater than zero")));
  });

  it("5 — crafted quantity < 0 is rejected", () => {
    const errors = validateInvoiceGroupsForExecute([
      sampleGroup({
        items: [{ description: "Line", quantity: -1, unit_price: 10, amount: -10 }],
      }),
    ]);
    assert.ok(errors.some((e) => e.includes("quantity must be greater than zero")));
  });

  it("6 — crafted unit_price = 0 is rejected", () => {
    const errors = validateInvoiceGroupsForExecute([
      sampleGroup({
        items: [{ description: "Line", quantity: 1, unit_price: 0, amount: 0 }],
      }),
    ]);
    assert.ok(errors.some((e) => e.includes("unit price must be greater than zero")));
  });

  it("7 — crafted unit_price < 0 is rejected", () => {
    const errors = validateInvoiceGroupsForExecute([
      sampleGroup({
        items: [{ description: "Line", quantity: 1, unit_price: -5, amount: -5 }],
      }),
    ]);
    assert.ok(errors.some((e) => e.includes("unit price must be greater than zero")));
  });

  it("8 — valid positive lines pass server validation", () => {
    const errors = validateInvoiceGroupsForExecute([sampleGroup()]);
    assert.deepEqual(errors, []);
  });

  it("9 — batch with one invalid invoice returns multiple errors", () => {
    const errors = validateInvoiceGroupsForExecute([
      sampleGroup({ invoice_number: "INV-OK" }),
      sampleGroup({
        invoice_number: "INV-BAD",
        items: [{ description: "Line", quantity: 0, unit_price: 10, amount: 0 }],
      }),
    ]);
    assert.ok(errors.some((e) => e.includes("INV-BAD")));
    assert.ok(errors.some((e) => e.includes("quantity must be greater than zero")));
  });
});

describe("invoice import execute action wiring", () => {
  const actionSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");

  it("executeInvoicesImport calls authoritative server validation before RPC", () => {
    const executeBlock = actionSrc.slice(
      actionSrc.indexOf("export async function executeInvoicesImport")
    );
    assert.match(executeBlock, /validateInvoiceGroupsForExecute\(invoiceGroups\)/);
    const validationIdx = executeBlock.indexOf("validateInvoiceGroupsForExecute");
    const rpcIdx = executeBlock.indexOf('const rpcName = "import_invoices_grouped"');
    assert.ok(validationIdx >= 0 && rpcIdx > validationIdx);
  });
});

describe("invoice import paid-total guard semantics (unchanged tolerance)", () => {
  it("2 — re-import total >= paid amount succeeds logically at tolerance boundary", () => {
    const internalRpc = readInternalRpcBody(HARDENING_MIGRATION_PATH);
    assert.match(internalRpc, /v_paid_total_tolerance constant numeric := 0\.01/);
    assert.match(
      internalRpc,
      /v_effective_paid > v_new_total \+ v_paid_total_tolerance/
    );
  });

  it("3 — re-import total < paid amount is rejected with canonical message", () => {
    const internalRpc = readInternalRpcBody(HARDENING_MIGRATION_PATH);
    assert.match(
      internalRpc,
      /cannot be updated to %s %s because %s %s has already been paid/
    );
  });
});

describe("invoice import integration proof references", () => {
  it("integration SQL documents concurrency proof for re-import vs manual payment", () => {
    const sql = readFileSync(INTEGRATION_SQL_PATH, "utf8");
    assert.match(sql, /IMP-001 concurrency/i);
    assert.match(sql, /FOR UPDATE/i);
  });

  it("integration SQL covers invalid line item rejection", () => {
    const sql = readFileSync(INTEGRATION_SQL_PATH, "utf8");
    assert.match(sql, /INV-ZERO-QTY/);
    assert.match(sql, /zero quantity execute should fail/i);
  });
});

describe("invoice import dry-run / execute parity", () => {
  it("10 — dry-run and execute share line-item and client resolution validation", () => {
    const internalRpc = readInternalRpcBody(HARDENING_MIGRATION_PATH);
    const dryRunReturnIdx = internalRpc.indexOf("IF p_dry_run THEN");
    const clientResolutionIdx = internalRpc.indexOf(
      "-- Client resolution (dry-run + execute)"
    );
    assert.ok(clientResolutionIdx >= 0 && dryRunReturnIdx > clientResolutionIdx);
    assert.match(
      internalRpc.slice(0, dryRunReturnIdx),
      /Quantity must be greater than zero/
    );
  });
});
