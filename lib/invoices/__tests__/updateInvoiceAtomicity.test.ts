import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { calculateInvoiceMoney } from "../calc";
import { isInvoiceFullyPaid } from "../invoiceFinancialState";

const MIGRATION_PATH =
  "supabase/migrations/20260727000000_rpc_update_invoice_with_items.sql";
const ACTIONS_PATH = "app/[workspaceId]/invoices/actions.ts";

function readUpdateInvoiceBlock(): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(
    src.indexOf("export async function updateInvoice"),
    src.indexOf("export async function deleteInvoice")
  );
}

describe("updateInvoice atomicity (invoice edit)", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const updateBlock = readUpdateInvoiceBlock();

  it("H — updateInvoice no longer uses independent update → delete → insert sequence", () => {
    assert.match(updateBlock, /\.rpc\(\s*["']rpc_update_invoice_with_items["']/);
    assert.doesNotMatch(updateBlock, /\.from\(["']invoice_items["']\)\.delete\(/);
    assert.doesNotMatch(
      updateBlock,
      /\.from\(["']invoice_items["']\)\.insert\(/
    );
    assert.doesNotMatch(
      updateBlock,
      /\.from\(["']invoices["']\)\s*\n?\s*\.update\(/
    );
  });

  it("H — updateInvoice still uses calculateInvoiceMoney before RPC", () => {
    assert.match(updateBlock, /calculateInvoiceMoney\(/);
    const moneyIdx = updateBlock.indexOf("calculateInvoiceMoney");
    const rpcIdx = updateBlock.indexOf('rpc("rpc_update_invoice_with_items"');
    assert.ok(moneyIdx >= 0 && rpcIdx > moneyIdx);
  });

  it("H — updateInvoice preserves pre-write guards and audit log after RPC", () => {
    assert.match(updateBlock, /requireUser\(\)/);
    assert.match(updateBlock, /requireWorkspace\(workspaceId\)/);
    assert.match(updateBlock, /InvoiceFormSchema\.parse/);
    assert.match(updateBlock, /isInvoiceFullyPaid/);
    assert.match(updateBlock, /logAuditEvent\(/);
    assert.match(updateBlock, /revalidatePath/);
    assert.match(updateBlock, /redirect\(/);
  });

  it("migration defines rpc_update_invoice_with_items with SECURITY DEFINER hardening", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_update_invoice_with_items/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /public\.workspace_members/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /DELETE FROM public\.invoice_items/);
    assert.match(migration, /INSERT INTO public\.invoice_items/);
    assert.match(migration, /v_invoice\.organization_id/);
    assert.doesNotMatch(migration, /v_item->>'invoice_id'/);
  });

  it("migration rejects fully paid using 0.01 tolerance (isInvoiceFullyPaid contract)", () => {
    assert.match(migration, /v_outstanding <= 0\.01/);
    assert.equal(isInvoiceFullyPaid(0.01), true);
    assert.equal(isInvoiceFullyPaid(0.02), false);
  });

  it("migration rejects archived and empty replacement items", () => {
    assert.match(
      migration,
      /Cannot edit an archived invoice\. Unarchive it first\./
    );
    assert.match(migration, /At least one line item is required/);
  });

  it("migration grants EXECUTE to authenticated only", () => {
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  });

  it("F — partially paid invoice remains editable (outstanding > 0.01)", () => {
    assert.equal(isInvoiceFullyPaid(50), false);
    assert.equal(isInvoiceFullyPaid(0.02), false);
  });

  it("A — money calculation contract unchanged for edit payload", () => {
    const money = calculateInvoiceMoney({
      items: [
        { quantity: 2, unit_price: 100 },
        { quantity: 1, unit_price: 50 },
      ],
      discountPercent: 10,
      taxPercent: 5,
    });
    assert.equal(money.subtotal, 250);
    assert.equal(money.discountAmount, 25);
    assert.equal(money.taxAmount, 11.25);
    assert.equal(money.total, 236.25);
  });
});

describe("updateInvoice RPC error mapping contract", () => {
  const updateBlock = readUpdateInvoiceBlock();

  it("E — fully paid server error preserved", () => {
    assert.match(updateBlock, /Cannot edit a fully paid invoice\./);
  });

  it("D — archived server error preserved", () => {
    assert.match(
      updateBlock,
      /Cannot edit an archived invoice\. Unarchive it first\./
    );
  });

  it("C — cross-workspace invoice load failure preserved", () => {
    assert.match(updateBlock, /Failed to load invoice:/);
  });
});
