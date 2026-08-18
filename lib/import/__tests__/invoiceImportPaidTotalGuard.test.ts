import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatInvoiceImportPaidTotalError,
  getInvoiceImportEffectivePaymentAmount,
  INVOICE_IMPORT_PAID_TOTAL_TOLERANCE,
  sumInvoiceImportEffectivePaid,
  wouldInvoiceReimportViolatePaidTotal,
} from "../invoiceImportPaidTotalGuard";
import { isFinanciallyEffectivePaymentStatus } from "@/lib/payments/paymentImportOverpay";

const GUARD_MIGRATION_PATH =
  "supabase/migrations/20260817120000_invoice_import_paid_total_guard.sql";

describe("invoice import paid-total guard semantics", () => {
  it("A — blocks re-import when new total is below effective paid", () => {
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 1000,
        effectivePaid: 1500,
      }),
      true
    );
  });

  it("B — allows re-import when new total equals effective paid", () => {
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 1500,
        effectivePaid: 1500,
      }),
      false
    );
  });

  it("C — allows re-import when new total exceeds effective paid", () => {
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 2000,
        effectivePaid: 500,
      }),
      false
    );
  });

  it("D — archived payment does not consume paid capacity", () => {
    assert.equal(
      getInvoiceImportEffectivePaymentAmount({
        amount: 1500,
        status: "completed",
        archivedAt: "2026-01-01T00:00:00Z",
      }),
      0
    );
  });

  it("E — pending payment does not consume paid capacity", () => {
    assert.equal(
      getInvoiceImportEffectivePaymentAmount({
        amount: 1500,
        status: "pending",
      }),
      0
    );
  });

  it("F — failed payment does not consume paid capacity", () => {
    assert.equal(
      getInvoiceImportEffectivePaymentAmount({
        amount: 1500,
        status: "failed",
      }),
      0
    );
  });

  it("G — completed/paid payments consume paid capacity", () => {
    assert.equal(
      sumInvoiceImportEffectivePaid([
        { amount: 800, status: "completed" },
        { amount: 700, status: "paid" },
      ]),
      1500
    );
  });

  it("H — null/empty payment status is financially effective", () => {
    assert.equal(isFinanciallyEffectivePaymentStatus(null), true);
    assert.equal(isFinanciallyEffectivePaymentStatus(""), true);
    assert.equal(
      getInvoiceImportEffectivePaymentAmount({ amount: 1500, status: null }),
      1500
    );
  });

  it("I — tolerance boundary allows paid within 0.01 of new total", () => {
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 1499.995,
        effectivePaid: 1500,
        tolerance: INVOICE_IMPORT_PAID_TOTAL_TOLERANCE,
      }),
      false
    );
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 1499.98,
        effectivePaid: 1500,
        tolerance: INVOICE_IMPORT_PAID_TOTAL_TOLERANCE,
      }),
      true
    );
  });

  it("J — new invoice with no existing payments is unaffected (no existing invoice id)", () => {
    assert.equal(
      wouldInvoiceReimportViolatePaidTotal({
        newTotal: 1000,
        effectivePaid: 0,
      }),
      false
    );
  });

  it("uses net_amount when present for effective payment sum", () => {
    assert.equal(
      getInvoiceImportEffectivePaymentAmount({
        amount: 100,
        netAmount: 95,
        status: "completed",
      }),
      95
    );
  });

  it("formats actionable import error message", () => {
    const message = formatInvoiceImportPaidTotalError({
      invoiceNumber: "INV-100",
      currency: "JOD",
      newTotal: 1000,
      effectivePaid: 1500,
    });
    assert.match(message, /Invoice INV-100 cannot be updated to JOD 1000\.00/);
    assert.match(message, /JOD 1500\.00 has already been paid/);
  });
});

describe("invoice import paid-total guard migration", () => {
  const migration = readFileSync(GUARD_MIGRATION_PATH, "utf8");

  it("K/L/M — guard runs before dry_run return and before execute mutations", () => {
    const guardSection = migration.slice(
      migration.indexOf("-- Paid-total guard:"),
      migration.indexOf("IF p_dry_run THEN")
    );
    assert.match(guardSection, /v_existing_invoice_id IS NOT NULL/);
    assert.match(guardSection, /v_effective_paid > v_new_total \+ v_paid_total_tolerance/);
    assert.match(guardSection, /cannot be updated to %s %s because %s %s has already been paid/);
    assert.match(guardSection, /COALESCE\(p\.net_amount, p\.amount\)/);
    assert.match(guardSection, /p\.status IS NULL[\s\S]*p\.status = 'completed'[\s\S]*p\.status = 'paid'/);
    assert.match(guardSection, /p\.archived_at IS NULL/);
    assert.doesNotMatch(guardSection, /DELETE FROM public\.payments/);
    assert.doesNotMatch(guardSection, /UPDATE public\.payments/);
  });

  it("uses canonical 0.01 tolerance constant", () => {
    assert.match(migration, /v_paid_total_tolerance constant numeric := 0\.01/);
  });

  it("returns structured ok:false for guard violations (batch preserved)", () => {
    assert.match(
      migration,
      /IF jsonb_array_length\(v_errors\) > 0 THEN[\s\S]*RETURN jsonb_build_object\([\s\S]*'ok', false[\s\S]*'created', jsonb_build_object\('clients', 0, 'invoices', 0, 'items', 0\)/
    );
  });

  it("preserves SECURITY DEFINER and hardened search_path", () => {
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
  });

  it("does not modify import_invoices_grouped wrapper or grants", () => {
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.import_invoices_grouped/);
    assert.doesNotMatch(migration, /GRANT EXECUTE/);
    assert.doesNotMatch(migration, /REVOKE EXECUTE/);
  });
});
