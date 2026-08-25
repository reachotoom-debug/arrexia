import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH =
  "supabase/migrations/20260825130000_rpc_update_invoice_paid_floor_guard.sql";
const ORIGINAL_MIGRATION_PATH =
  "supabase/migrations/20260727000000_rpc_update_invoice_with_items.sql";
const PAYMENT_MIGRATION_PATH =
  "supabase/migrations/20260825120000_rpc_create_payment_manual.sql";
const ACTIONS_PATH = "app/[workspaceId]/invoices/actions.ts";

function readUpdateInvoiceBlock(): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(
    src.indexOf("export async function updateInvoice"),
    src.indexOf("export async function deleteInvoice")
  );
}

/** Mirrors RPC paid-floor guard using the same 0.01 tolerance. */
function wouldRejectNewTotalBelowPaid(
  newTotal: number,
  effectivePaid: number,
  tolerance = 0.01
): boolean {
  return newTotal < effectivePaid - tolerance;
}

/** Mirrors RPC fully-paid edit guard on current outstanding. */
function wouldRejectFullyPaidEdit(
  currentTotal: number,
  effectivePaid: number,
  tolerance = 0.01
): boolean {
  const outstanding = Math.max(currentTotal - effectivePaid, 0);
  return outstanding <= tolerance;
}

describe("rpc_update_invoice_with_items paid-floor guard (F1)", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const originalMigration = readFileSync(ORIGINAL_MIGRATION_PATH, "utf8");
  const paymentMigration = readFileSync(PAYMENT_MIGRATION_PATH, "utf8");
  const updateBlock = readUpdateInvoiceBlock();

  it("new migration replaces rpc_update_invoice_with_items without changing signature", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_update_invoice_with_items/);
    assert.match(
      migration,
      /p_amount numeric,\s*\n\s*p_items jsonb/
    );
    assert.doesNotMatch(originalMigration, /Invoice total cannot be less than the amount already paid\./);
    assert.match(migration, /Invoice total cannot be less than the amount already paid\./);
  });

  it("preserves SECURITY DEFINER hardening and authenticated-only grants", () => {
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  });

  it("lock order: invoice FOR UPDATE before payment sum and paid-floor guard", () => {
    const lockIdx = migration.indexOf("FOR UPDATE");
    const paidSumIdx = migration.indexOf("COALESCE(SUM(COALESCE(p.net_amount, p.amount)), 0)");
    const paidFloorIdx = migration.indexOf(
      "Invoice total cannot be less than the amount already paid."
    );
    const updateIdx = migration.indexOf("UPDATE public.invoices");

    assert.ok(lockIdx >= 0);
    assert.ok(paidSumIdx > lockIdx);
    assert.ok(paidFloorIdx > paidSumIdx);
    assert.ok(updateIdx > paidFloorIdx);
  });

  it("effective paid uses COALESCE(net_amount, amount) with view-aligned statuses", () => {
    assert.match(migration, /COALESCE\(SUM\(COALESCE\(p\.net_amount, p\.amount\)\), 0\)/);
    assert.match(migration, /p\.archived_at IS NULL/);
    assert.match(migration, /p\.status IS NULL/);
    assert.match(migration, /p\.status = 'completed'/);
    assert.match(migration, /p\.status = 'paid'/);
    assert.doesNotMatch(migration, /p\.status = 'pending'/);
    assert.doesNotMatch(migration, /p\.status = 'failed'/);
    assert.doesNotMatch(migration, /p\.status = 'refunded'/);
  });

  it("uses 0.01 monetary tolerance constant aligned with isInvoiceFullyPaid", () => {
    assert.match(migration, /v_paid_total_tolerance constant numeric := 0\.01/);
    assert.match(migration, /v_outstanding <= v_paid_total_tolerance/);
    assert.match(
      migration,
      /p_amount < COALESCE\(v_paid, 0\) - v_paid_total_tolerance/
    );
  });

  it("p_amount is the authoritative new invoice total from calculateInvoiceMoney", () => {
    assert.match(updateBlock, /p_amount: money\.total/);
    assert.match(updateBlock, /calculateInvoiceMoney\(/);
  });

  it("1 — no payments: total 3306 → 1000 allowed", () => {
    assert.equal(wouldRejectNewTotalBelowPaid(1000, 0), false);
    assert.equal(wouldRejectFullyPaidEdit(3306, 0), false);
  });

  it("2 — partially paid: paid 1500, new total 2000 allowed", () => {
    assert.equal(wouldRejectFullyPaidEdit(3306, 1500), false);
    assert.equal(wouldRejectNewTotalBelowPaid(2000, 1500), false);
  });

  it("3 — exact paid boundary: paid 1500, new total 1500 allowed (not fully paid yet on current total)", () => {
    assert.equal(wouldRejectFullyPaidEdit(3306, 1500), false);
    assert.equal(wouldRejectNewTotalBelowPaid(1500, 1500), false);
  });

  it("3b — exact paid boundary: already fully paid invoice blocked by existing rule first", () => {
    assert.equal(wouldRejectFullyPaidEdit(1500, 1500), true);
  });

  it("4 — below paid: paid 1500, new total 1499 rejected", () => {
    assert.equal(wouldRejectNewTotalBelowPaid(1499, 1500), true);
  });

  it("5 — monetary tolerance: new total 1499.99 with paid 1500 allowed", () => {
    assert.equal(wouldRejectNewTotalBelowPaid(1499.99, 1500), false);
  });

  it("6 — net_amount semantics preserved in payment sum", () => {
    const paidWithFee = 1500;
    const paidWithoutNet = 1600;
    assert.equal(wouldRejectNewTotalBelowPaid(1499, paidWithFee), true);
    assert.equal(wouldRejectNewTotalBelowPaid(1499, paidWithoutNet), true);
    assert.match(migration, /COALESCE\(p\.net_amount, p\.amount\)/);
  });

  it("7 — pending/failed/refunded payments do not block edits via paid floor", () => {
    assert.doesNotMatch(migration, /status = 'pending'/);
    assert.doesNotMatch(migration, /status = 'failed'/);
    assert.doesNotMatch(migration, /status = 'refunded'/);
    assert.equal(wouldRejectNewTotalBelowPaid(1000, 0), false);
  });

  it("8 — legacy status paid counts toward effective paid", () => {
    assert.match(migration, /p\.status = 'paid'/);
  });

  it("9 — archived payments excluded from effective paid", () => {
    assert.match(migration, /p\.archived_at IS NULL/);
  });

  it("10 — payment RPC locks the same public.invoices row FOR UPDATE", () => {
    assert.match(paymentMigration, /FROM public\.invoices i/);
    assert.match(paymentMigration, /FOR UPDATE/);
    assert.match(migration, /FROM public\.invoices i/);
    assert.match(migration, /FOR UPDATE/);
  });

  it("updateInvoice maps paid-floor RPC error to stable message", () => {
    assert.match(
      updateBlock,
      /Invoice total cannot be less than the amount already paid\./
    );
  });
});
