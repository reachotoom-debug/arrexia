import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getEffectivePaymentAmount,
  isFinanciallyEffectivePaymentStatus,
  PAYMENT_OVERPAY_TOLERANCE,
  validatePaymentImportBatchOverpay,
  type ExistingPaymentSnapshot,
  type InvoiceOutstandingSnapshot,
  type PaymentImportOverpayRow,
} from "../paymentImportOverpay";

const INV_A = "inv-a";
const INV_B = "inv-b";

function invoice(
  id: string,
  outstanding: number,
  invoiceNumber = "INV-0001"
): InvoiceOutstandingSnapshot {
  return {
    invoiceId: id,
    invoiceNumber,
    total: outstanding,
    outstanding,
  };
}

function row(
  overrides: Partial<PaymentImportOverpayRow> & Pick<PaymentImportOverpayRow, "rowId">
): PaymentImportOverpayRow {
  return {
    invoiceId: INV_A,
    invoiceNumber: "INV-0001",
    amount: 0,
    status: "completed",
    transactionId: "",
    isUpdate: false,
    ...overrides,
  };
}

describe("payment import overpayment semantics", () => {
  it("K — pending/failed are not financially effective (matches invoices_view)", () => {
    assert.equal(isFinanciallyEffectivePaymentStatus("completed"), true);
    assert.equal(isFinanciallyEffectivePaymentStatus("paid"), true);
    assert.equal(isFinanciallyEffectivePaymentStatus(null), true);
    assert.equal(isFinanciallyEffectivePaymentStatus(""), true);
    assert.equal(isFinanciallyEffectivePaymentStatus("pending"), false);
    assert.equal(isFinanciallyEffectivePaymentStatus("failed"), false);
    assert.equal(getEffectivePaymentAmount(500, "pending"), 0);
    assert.equal(getEffectivePaymentAmount(500, "failed"), 0);
    assert.equal(getEffectivePaymentAmount(500, "completed"), 500);
  });

  describe("validatePaymentImportBatchOverpay", () => {
    const invoices = new Map<string, InvoiceOutstandingSnapshot>([
      [INV_A, invoice(INV_A, 2500, "INV-0001")],
      [INV_B, invoice(INV_B, 1000, "INV-0002")],
    ]);

    it("A — new payment below outstanding passes", () => {
      const errors = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 2000 })],
        invoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 0);
    });

    it("B — new payment exactly equal to outstanding passes", () => {
      const errors = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 2500 })],
        invoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 0);
    });

    it("C — new payment above outstanding is blocked", () => {
      const errors = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 2500.02 })],
        invoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 1);
      assert.match(errors.get("r1")!, /Payment exceeds invoice outstanding balance/);
    });

    it("D — existing partial payment capacity + valid new import passes", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 1500 })],
        invoices: partialInvoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 0);
    });

    it("E — existing partial payment capacity + excessive new import blocked", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 2000.02 })],
        invoices: partialInvoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 1);
    });

    it("F — re-import same transaction_id unchanged passes", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const existing = new Map<string, ExistingPaymentSnapshot>([
        [
          "TX-1",
          {
            transactionId: "TX-1",
            invoiceId: INV_A,
            amount: 1000,
            status: "completed",
          },
        ],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({
            rowId: "r1",
            amount: 1000,
            transactionId: "TX-1",
            isUpdate: true,
          }),
        ],
        invoices: partialInvoices,
        existingPayments: existing,
      });
      assert.equal(errors.size, 0);
    });

    it("G — re-import increased amount within available capacity passes", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const existing = new Map<string, ExistingPaymentSnapshot>([
        [
          "TX-1",
          {
            transactionId: "TX-1",
            invoiceId: INV_A,
            amount: 1000,
            status: "completed",
          },
        ],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({
            rowId: "r1",
            amount: 1500,
            transactionId: "TX-1",
            isUpdate: true,
          }),
        ],
        invoices: partialInvoices,
        existingPayments: existing,
      });
      assert.equal(errors.size, 0);
    });

    it("H — re-import causing overpayment is blocked", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const existing = new Map<string, ExistingPaymentSnapshot>([
        [
          "TX-1",
          {
            transactionId: "TX-1",
            invoiceId: INV_A,
            amount: 1000,
            status: "completed",
          },
        ],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({
            rowId: "r1",
            amount: 3001,
            transactionId: "TX-1",
            isUpdate: true,
          }),
        ],
        invoices: partialInvoices,
        existingPayments: existing,
      });
      assert.equal(errors.size, 1);
    });

    it("I — two new rows cumulatively overpay same invoice blocked", () => {
      const smallOutstanding = new Map([
        [INV_A, invoice(INV_A, 1000, "INV-0001")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({ rowId: "r1", amount: 600, transactionId: "TX-A" }),
          row({ rowId: "r2", amount: 600, transactionId: "TX-B" }),
        ],
        invoices: smallOutstanding,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 1);
      assert.ok(errors.has("r2"));
    });

    it("J — payments against different invoices do not affect each other", () => {
      const multi = new Map([
        [INV_A, invoice(INV_A, 500, "INV-0001")],
        [INV_B, invoice(INV_B, 500, "INV-0002")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({
            rowId: "r1",
            invoiceId: INV_A,
            invoiceNumber: "INV-0001",
            amount: 500,
            transactionId: "TX-A",
          }),
          row({
            rowId: "r2",
            invoiceId: INV_B,
            invoiceNumber: "INV-0002",
            amount: 500,
            transactionId: "TX-B",
          }),
        ],
        invoices: multi,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 0);
    });

    it("K — pending import rows do not consume outstanding capacity", () => {
      const smallOutstanding = new Map([
        [INV_A, invoice(INV_A, 100, "INV-0001")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({ rowId: "r1", amount: 1000, status: "pending", transactionId: "TX-P" }),
          row({ rowId: "r2", amount: 100, status: "completed", transactionId: "TX-C" }),
        ],
        invoices: smallOutstanding,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 0);
    });

    it("L — archived existing payment treated as zero release on update lookup", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 2000, "INV-0001")],
      ]);
      const errors = validatePaymentImportBatchOverpay({
        rows: [
          row({
            rowId: "r1",
            amount: 2500,
            transactionId: "TX-ARCH",
            isUpdate: true,
          }),
        ],
        invoices: partialInvoices,
        existingPayments: new Map(),
      });
      assert.equal(errors.size, 1);
    });

    it("uses 0.01 tolerance like manual payment creation", () => {
      const partialInvoices = new Map([
        [INV_A, invoice(INV_A, 100, "INV-0001")],
      ]);
      const withinTolerance = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 100 + PAYMENT_OVERPAY_TOLERANCE })],
        invoices: partialInvoices,
        existingPayments: new Map(),
      });
      assert.equal(withinTolerance.size, 0);

      const overTolerance = validatePaymentImportBatchOverpay({
        rows: [row({ rowId: "r1", amount: 100 + PAYMENT_OVERPAY_TOLERANCE + 0.001 })],
        invoices: partialInvoices,
        existingPayments: new Map(),
      });
      assert.equal(overTolerance.size, 1);
    });
  });
});

describe("payment import preview wiring", () => {
  it("preview loads invoices_view and validates batch overpay", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    assert.match(src, /from\("invoices_view"\)/);
    assert.match(src, /validatePaymentImportBatchOverpay/);
    assert.match(src, /paymentImportOverpay/);
  });

  it("M — workspace isolation remains enforced in preview overpay queries", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    const previewBlock = src.slice(
      src.indexOf("Overpayment validation"),
      src.indexOf("Determine overall ok status")
    );
    assert.match(previewBlock, /\.eq\("workspace_id", workspaceId\)/);
    assert.match(src, /requireWorkspace\(workspaceId\)/);
  });
});

describe("rpc_import_payments overpay migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260816120000_rpc_import_payments_overpay_guard.sql",
    "utf8"
  );

  it("N — RPC contains authoritative overpayment protection", () => {
    assert.match(migration, /Payment exceeds invoice outstanding balance/);
    assert.match(migration, /invoices_view/);
    assert.match(migration, /_payment_import_capacity/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /0\.01/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_import_payments/);
  });

  it("migration does not broaden EXECUTE grants to authenticated", () => {
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/i);
  });
});
