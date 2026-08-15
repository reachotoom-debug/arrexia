import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveImportedInvoiceStatus } from "@/lib/import/invoiceImportPreviewWarnings";

const INVOICES_ACTION_PATH = "app/[workspaceId]/settings/import/actions/invoices.ts";
const INVOICES_IMPORT_SECTION_PATH =
  "app/[workspaceId]/settings/import/_components/ImportInvoicesSection.tsx";
const MIGRATION_PATH =
  "supabase/migrations/20260810120000_fix_import_invoices_grouped_integrity.sql";

function rpcStatusFromRaw(statusRaw: string | null | undefined): string {
  return resolveImportedInvoiceStatus(statusRaw).baseStatus;
}

describe("invoice import status normalization for RPC + preview", () => {
  it('A — status "overdue" normalizes to sent with warning and no invalid-status error', () => {
    const result = resolveImportedInvoiceStatus("overdue");
    assert.equal(result.baseStatus, "sent");
    assert.equal(result.error, null);
    assert.match(result.warning ?? "", /Status "Overdue" was normalized to "Sent"/);
    assert.equal(rpcStatusFromRaw("overdue"), "sent");
  });

  it('B — status "Overdue" is case-insensitive', () => {
    const result = resolveImportedInvoiceStatus("Overdue");
    assert.equal(result.baseStatus, "sent");
    assert.equal(result.error, null);
    assert.match(result.warning ?? "", /Status "Overdue" was normalized to "Sent"/);
  });

  it('C — status "sent" is accepted without normalization warning', () => {
    const result = resolveImportedInvoiceStatus("sent");
    assert.deepEqual(result, {
      baseStatus: "sent",
      warning: null,
      error: null,
    });
    assert.equal(rpcStatusFromRaw("sent"), "sent");
  });

  it('D — invalid status "banana" blocks import with validation error', () => {
    const result = resolveImportedInvoiceStatus("banana");
    assert.equal(result.warning, null);
    assert.match(result.error ?? "", /Invalid Status: banana/);
  });

  it("E — item RPC rows must not include lifecycle status field", () => {
    const actionsSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");
    const itemRpcBlock = actionsSrc.slice(
      actionsSrc.indexOf('row_type: "item"'),
      actionsSrc.indexOf("// Call RPC with dry_run=true")
    );
    assert.match(itemRpcBlock, /row_type: "item"/);
    assert.doesNotMatch(itemRpcBlock, /status:\s*statusResolution/);
    assert.doesNotMatch(itemRpcBlock, /status:\s*getField\(row, "status"\)/);
  });

  it("F — normalization does not create payments (RPC + execute paths)", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const actionsSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");
    const executeBlock = actionsSrc.slice(
      actionsSrc.indexOf("export async function executeInvoicesImport")
    );
    assert.doesNotMatch(migration, /INSERT INTO public\.payments/);
    assert.doesNotMatch(executeBlock, /from\("payments"\)\.insert/);
    assert.doesNotMatch(executeBlock, /\.from\(['"]payments['"]\)/);
  });

  it("G — preview RPC payload and execute payload use normalized lifecycle status", () => {
    const actionsSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");
    const rpcBlock = actionsSrc.slice(
      actionsSrc.indexOf("// Convert canonical rows to RPC format"),
      actionsSrc.indexOf("// Call RPC with dry_run=true")
    );
    assert.match(rpcBlock, /resolveImportedInvoiceStatus/);
    assert.match(rpcBlock, /status: statusResolution\.baseStatus/);
    assert.doesNotMatch(rpcBlock, /toLowerCase\(\)\.trim\(\) as "draft"/);

    const executeBlock = actionsSrc.slice(
      actionsSrc.indexOf("export async function executeInvoicesImport")
    );
    assert.match(executeBlock, /status: group\.base_status\.toLowerCase\(\)/);
  });

  it("H — SQL validates lifecycle status on invoice rows only", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const validateSection = migration.slice(
      migration.indexOf("-- Validate (first pass"),
      migration.indexOf("IF jsonb_array_length(v_errors) > 0 THEN")
    );
    assert.match(
      validateSection,
      /IF v_rt = 'invoice' THEN[\s\S]*Invalid status[\s\S]*IF v_rt = 'item' THEN/
    );
    const itemSection = validateSection.slice(validateSection.indexOf("IF v_rt = 'item' THEN"));
    assert.doesNotMatch(itemSection, /Invalid status/);
  });

  it("I — preview global errors are not duplicated in ImportInvoicesSection error state", () => {
    const sectionSrc = readFileSync(INVOICES_IMPORT_SECTION_PATH, "utf8");
    const previewBlock = sectionSrc.slice(
      sectionSrc.indexOf("const result = await previewInvoicesImport"),
      sectionSrc.indexOf("const handleExecute = async")
    );
    assert.match(previewBlock, /setPreview\(result\)/);
    assert.match(previewBlock, /setError\(null\)/);
    assert.doesNotMatch(previewBlock, /result\.errors\.join\("; "\)/);
  });
});

describe("supported derived status mappings", () => {
  it("maps Paid, Partially Paid, and Overdue to sent without payment inference", () => {
    for (const raw of ["Paid", "Partially Paid", "Overdue", "overdue"]) {
      const result = resolveImportedInvoiceStatus(raw);
      assert.equal(result.baseStatus, "sent");
      assert.equal(result.error, null);
      assert.ok(result.warning);
      assert.match(result.warning ?? "", /determined from recorded payments/);
    }
  });
});
