import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatPaymentUnarchiveOverpayError,
  validatePaymentUnarchiveBatchOverpay,
  wouldRestorePaymentCauseOverpay,
  type PaymentUnarchiveCandidate,
} from "../paymentUnarchiveOverpay";
import { PAYMENT_OVERPAY_TOLERANCE } from "../paymentImportOverpay";

const INVOICE_ID = "inv-1000";

function candidate(
  overrides: Partial<PaymentUnarchiveCandidate> & Pick<PaymentUnarchiveCandidate, "paymentId">
): PaymentUnarchiveCandidate {
  return {
    invoiceId: INVOICE_ID,
    amount: 0,
    status: "completed",
    ...overrides,
  };
}

describe("payment unarchive overpay guard", () => {
  it("A — 1000 invoice; archived completed 600; active completed 1000 -> unarchive 600 BLOCKED", () => {
    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600,
        paymentStatus: "completed",
        currentOutstanding: 0,
      }),
      true
    );

    const errors = validatePaymentUnarchiveBatchOverpay({
      payments: [candidate({ paymentId: "pay-a", amount: 600, status: "completed" })],
      outstandingByInvoice: new Map([[INVOICE_ID, 0]]),
    });
    assert.equal(errors.size, 1);
    assert.match(errors.get("pay-a")!, /Restoring this payment would cause overpayment/);
  });

  it("B — 1000 invoice; archived completed 600; active completed 400 -> unarchive 600 ALLOWED", () => {
    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600,
        paymentStatus: "completed",
        currentOutstanding: 600,
      }),
      false
    );

    const errors = validatePaymentUnarchiveBatchOverpay({
      payments: [candidate({ paymentId: "pay-a", amount: 600, status: "completed" })],
      outstandingByInvoice: new Map([[INVOICE_ID, 600]]),
    });
    assert.equal(errors.size, 0);
  });

  it("C — exact remaining capacity is allowed within existing monetary tolerance", () => {
    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600,
        paymentStatus: "completed",
        currentOutstanding: 600,
        tolerance: PAYMENT_OVERPAY_TOLERANCE,
      }),
      false
    );

    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600.005,
        paymentStatus: "completed",
        currentOutstanding: 600,
        tolerance: PAYMENT_OVERPAY_TOLERANCE,
      }),
      false
    );

    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600.02,
        paymentStatus: "completed",
        currentOutstanding: 600,
        tolerance: PAYMENT_OVERPAY_TOLERANCE,
      }),
      true
    );
  });

  it("D — archived pending/non-effective payment does not consume completed-payment capacity", () => {
    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600,
        paymentStatus: "pending",
        currentOutstanding: 0,
      }),
      false
    );

    assert.equal(
      wouldRestorePaymentCauseOverpay({
        paymentAmount: 600,
        paymentStatus: "failed",
        currentOutstanding: 0,
      }),
      false
    );

    const errors = validatePaymentUnarchiveBatchOverpay({
      payments: [
        candidate({ paymentId: "pay-pending", amount: 600, status: "pending" }),
        candidate({ paymentId: "pay-failed", amount: 600, status: "failed" }),
      ],
      outstandingByInvoice: new Map([[INVOICE_ID, 0]]),
    });
    assert.equal(errors.size, 0);
  });

  it("batch — cumulative unarchive respects shared invoice capacity", () => {
    const errors = validatePaymentUnarchiveBatchOverpay({
      payments: [
        candidate({ paymentId: "pay-a", amount: 400, status: "completed" }),
        candidate({ paymentId: "pay-b", amount: 400, status: "completed" }),
      ],
      outstandingByInvoice: new Map([[INVOICE_ID, 600]]),
    });

    assert.equal(errors.size, 1);
    assert.equal(errors.has("pay-a"), false);
    assert.match(errors.get("pay-b")!, /Restoring this payment would cause overpayment/);
  });

  it("error message explains restoring would cause overpayment", () => {
    const message = formatPaymentUnarchiveOverpayError({
      paymentAmount: 600,
      availableOutstanding: 0,
    });
    assert.match(message, /Restoring this payment would cause overpayment/);
    assert.match(message, /600\.00/);
    assert.match(message, /0\.00/);
  });
});

describe("payment unarchive action wiring", () => {
  const actionsSrc = readFileSync("app/[workspaceId]/payments/actions.ts", "utf8");

  it("E — cross-workspace authorization remains on unarchive paths", () => {
    const actionsSrc = readFileSync("app/[workspaceId]/payments/actions.ts", "utf8");
    const unarchiveBlock = actionsSrc.slice(
      actionsSrc.indexOf("export async function unarchivePayment"),
      actionsSrc.indexOf("export async function bulkArchivePayments")
    );
    const bulkUnarchiveBlock = actionsSrc.slice(
      actionsSrc.indexOf("export async function bulkUnarchivePayments"),
      actionsSrc.length
    );
    const restoreHelper = actionsSrc.slice(
      actionsSrc.indexOf("async function restorePaymentViaRpc"),
      actionsSrc.indexOf("export async function createPayment")
    );

    assert.match(unarchiveBlock, /requireWorkspace\(workspaceId\)/);
    assert.match(restoreHelper, /p_workspace_id: workspaceId/);
    assert.match(restoreHelper, /rpc_unarchive_payment_manual/);
    assert.match(bulkUnarchiveBlock, /requireWorkspace\(workspaceId\)/);
  });

  it("F — archive operation itself remains unchanged (no unarchive overpay guard)", () => {
    const archiveBlock = actionsSrc.slice(
      actionsSrc.indexOf("export async function archivePayment"),
      actionsSrc.indexOf("export async function unarchivePayment")
    );

    assert.doesNotMatch(archiveBlock, /wouldRestorePaymentCauseOverpay/);
    assert.doesNotMatch(archiveBlock, /validatePaymentUnarchiveBatchOverpay/);
    assert.match(archiveBlock, /\.update\(\{ archived_at: new Date\(\)\.toISOString\(\) \}\)/);
  });

  it("unarchive paths delegate to atomic restore RPC", () => {
    assert.match(actionsSrc, /restorePaymentViaRpc/);
    assert.match(actionsSrc, /rpc_unarchive_payment_manual/);
    assert.match(actionsSrc, /mapUnarchivePaymentRpcError/);
  });
});
