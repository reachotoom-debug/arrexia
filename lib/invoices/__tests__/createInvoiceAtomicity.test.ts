import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { calculateInvoiceMoney } from "../calc";

const MIGRATION_PATH =
  "supabase/migrations/20260728000000_rpc_create_invoice_with_items.sql";
const ACTIONS_PATH = "app/[workspaceId]/invoices/actions.ts";

function readCreateInvoiceBlock(): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(
    src.indexOf("export async function createInvoice"),
    src.indexOf("export async function updateInvoice")
  );
}

describe("createInvoice atomicity (invoice create)", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const createBlock = readCreateInvoiceBlock();

  it("A — createInvoice uses rpc_create_invoice_with_items", () => {
    assert.match(createBlock, /\.rpc\(\s*["']rpc_create_invoice_with_items["']/);
  });

  it("B — createInvoice no longer independently inserts invoices then invoice_items", () => {
    assert.doesNotMatch(
      createBlock,
      /\.from\(["']invoices["']\)\s*\n?\s*\.insert\(/
    );
    assert.doesNotMatch(
      createBlock,
      /\.from\(["']invoice_items["']\)\s*\n?\s*\.insert\(/
    );
  });

  it("C — calculateInvoiceMoney remains the financial calculation source", () => {
    assert.match(createBlock, /calculateInvoiceMoney\(/);
    const moneyIdx = createBlock.indexOf("calculateInvoiceMoney");
    const rpcIdx = createBlock.indexOf('"rpc_create_invoice_with_items"');
    assert.ok(moneyIdx >= 0 && rpcIdx > moneyIdx);
    assert.match(createBlock, /p_subtotal: money\.subtotal/);
    assert.match(createBlock, /p_amount: money\.total/);
  });

  it("D — computeDueDate / due-date semantics remain intact", () => {
    assert.match(createBlock, /computeDueDate\(parsed\.issueDate, effectiveDays\)/);
    assert.match(createBlock, /p_due_date: dueDate/);
    assert.doesNotMatch(
      createBlock,
      /p_due_date: parsed\.dueDate/
    );
  });

  it("E — duplicate invoice-number error mapping remains user-friendly", () => {
    assert.match(createBlock, /fieldErrors:[\s\S]*invoice_number:[\s\S]*already exists/);
    assert.match(createBlock, /23505/);
    assert.match(createBlock, /logPostgresUniqueViolation\("createInvoice"/);
  });

  it("F — inactive/archived client protection remains intact", () => {
    assert.match(createBlock, /Cannot create invoice for archived client/);
    assert.match(createBlock, /Cannot create invoice for inactive client/);
    assert.match(createBlock, /clientRow\?\.archived_at/);
    assert.match(createBlock, /clientRow\?\.is_active === false/);
  });

  it("G — Draft creation semantics remain intact", () => {
    assert.match(migration, /lower\(p_status\)/);
    assert.match(createBlock, /normalizedStatus = parsed\.status\.toLowerCase\(\)/);
    assert.match(createBlock, /p_status: normalizedStatus/);
  });

  it("H — Sent creation semantics remain intact", () => {
    assert.match(migration, /'draft', 'sent', 'void'/);
    assert.match(createBlock, /"draft" \| "sent" \| "void"/);
  });

  it("I — empty items rejected by database function contract", () => {
    assert.match(migration, /At least one line item is required/);
    assert.match(migration, /jsonb_array_length\(p_items\)/);
  });

  it("migration defines rpc_create_invoice_with_items with SECURITY DEFINER hardening", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_create_invoice_with_items/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /public\.workspace_members/);
    assert.match(migration, /v_organization_id/);
    assert.match(migration, /FROM public\.workspaces w/);
    assert.match(migration, /Cannot create invoice for archived client/);
    assert.match(migration, /Cannot create invoice for inactive client/);
    assert.doesNotMatch(migration, /v_item->>'invoice_id'/);
    assert.doesNotMatch(migration, /v_item->>'organization_id'/);
  });

  it("migration grants EXECUTE to authenticated only", () => {
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  });

  it("preserves audit log and revalidate after successful RPC", () => {
    assert.match(createBlock, /logAuditEvent\(/);
    assert.match(createBlock, /revalidatePath/);
    assert.match(createBlock, /return invoiceId/);
  });

  it("money calculation contract unchanged for create payload", () => {
    const money = calculateInvoiceMoney({
      items: [{ quantity: 1, unit_price: 100 }],
      discountPercent: 0,
      taxPercent: 10,
    });
    assert.equal(money.subtotal, 100);
    assert.equal(money.taxAmount, 10);
    assert.equal(money.total, 110);
  });
});
