import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  isExpectedPaymentManualRpcError,
  mapCreatePaymentRpcError,
  mapUpdatePaymentRpcError,
} from "../mapCreatePaymentRpcError";

const EDIT_PAGE = "app/[workspaceId]/payments/[paymentId]/edit/page.tsx";
const UPDATE_ACTION = "app/[workspaceId]/payments/actions.ts";
const CREATE_PAGE = "app/[workspaceId]/payments/new/page.tsx";
const CREATE_ACTION = "app/[workspaceId]/payments/actions.ts";

function readUpdatePaymentBlock(): string {
  const src = readFileSync(UPDATE_ACTION, "utf8");
  return src.slice(
    src.indexOf("export async function updatePayment"),
    src.indexOf("export async function deletePayment")
  );
}

function readCreatePaymentBlock(): string {
  const src = readFileSync(CREATE_ACTION, "utf8");
  return src.slice(
    src.indexOf("export async function createPayment"),
    src.indexOf("export async function updatePayment")
  );
}

describe("payment manual RPC error handling", () => {
  it("update overpayment maps to user-facing result without throwing in action", () => {
    const mapped = mapUpdatePaymentRpcError({
      code: "P0001",
      message:
        "Updating this payment would result in overpayment. Current outstanding: 0.00, payment change: +1806.00.",
    });
    assert.equal(mapped.error, "Payment exceeds the invoice outstanding balance.");
    assert.equal(mapped.code, "P0001");
  });

  it("duplicate transaction_id maps cleanly for update", () => {
    const mapped = mapUpdatePaymentRpcError({
      code: "23505",
      message:
        "A payment with this transaction reference already exists in this workspace.",
    });
    assert.match(mapped.error, /transaction reference already exists/);
    assert.equal(isExpectedPaymentManualRpcError(mapped), true);
  });

  it("expected business-rule RPC failures are classified as expected", () => {
    const cases = [
      mapUpdatePaymentRpcError({
        code: "P0002",
        message: "Payment not found",
      }),
      mapUpdatePaymentRpcError({
        code: "P0002",
        message: "Invoice not found",
      }),
      mapUpdatePaymentRpcError({
        code: "42501",
        message: "Not a workspace member",
      }),
      mapUpdatePaymentRpcError({
        code: "P0001",
        message: "Cannot change invoice for an existing payment",
      }),
      mapUpdatePaymentRpcError({
        code: "22023",
        message: "Amount must be positive",
      }),
    ];

    for (const mapped of cases) {
      assert.equal(isExpectedPaymentManualRpcError(mapped), true, mapped.error);
    }
  });

  it("unexpected errors remain distinguishable from expected business-rule failures", () => {
    const unexpected = {
      error: "Failed to update payment: connection terminated unexpectedly",
      code: "08006",
    };
    assert.equal(isExpectedPaymentManualRpcError(unexpected), false);
  });

  it("create overpayment maps to user-facing result without throwing in action", () => {
    const mapped = mapCreatePaymentRpcError({
      code: "P0001",
      message:
        "Payment amount (1806.00) exceeds the invoice outstanding balance (0.00). Please enter an amount less than or equal to 0.00.",
    });
    assert.equal(mapped.error, "Payment exceeds the invoice outstanding balance.");
    assert.equal(isExpectedPaymentManualRpcError(mapped), true);
  });

  it("duplicate transaction_id maps cleanly for create", () => {
    const mapped = mapCreatePaymentRpcError({
      code: "23505",
      message:
        "A payment with this transaction reference already exists in this workspace.",
    });
    assert.match(mapped.error, /transaction reference already exists/);
    assert.equal(isExpectedPaymentManualRpcError(mapped), true);
  });

  it("createPayment returns mapped errors instead of throwing", () => {
    const block = readCreatePaymentBlock();
    assert.match(block, /return mapCreatePaymentRpcError\(rpcError\)/);
    assert.doesNotMatch(block, /throw new Error/);
  });

  it("successful create path still audits and revalidates before returning id", () => {
    const block = readCreatePaymentBlock();
    const rpcErrorIdx = block.indexOf("if (rpcError)");
    const auditIdx = block.indexOf("logAuditEvent");
    const revalidateIdx = block.indexOf("revalidateFinancialSurfacesAfterPayment");
    const successIdx = block.indexOf("return { id: data.id }");
    assert.ok(rpcErrorIdx >= 0 && auditIdx > rpcErrorIdx && revalidateIdx > auditIdx);
    assert.ok(successIdx > revalidateIdx);
  });

  it("create page redirects expected create errors instead of throwing through route", () => {
    const src = readFileSync(CREATE_PAGE, "utf8");
    assert.match(src, /isExpectedPaymentManualRpcError/);
    assert.match(src, /redirect\([\s\S]*\/payments\/new\?/);
    assert.match(src, /params\.set\("error", result\.error\)/);
    assert.match(src, /submitError=\{submitError\}/);
    assert.doesNotMatch(
      src,
      /if \("error" in result\) \{\s*throw new Error\(result\.error\);\s*\}/
    );
  });

  it("create redirect uses mapped error text only (no raw rpc message passthrough)", () => {
    const src = readFileSync(CREATE_PAGE, "utf8");
    assert.match(src, /params\.set\("error", result\.error\)/);
    assert.doesNotMatch(src, /encodeURIComponent\(rpcError/);
    assert.doesNotMatch(src, /params\.set\("error", rpcError/);
  });

  it("updatePayment returns mapped errors instead of throwing", () => {
    const block = readUpdatePaymentBlock();
    assert.match(block, /return mapUpdatePaymentRpcError\(rpcError\)/);
    assert.doesNotMatch(block, /throw new Error/);
  });

  it("successful update path still audits and revalidates before success return", () => {
    const block = readUpdatePaymentBlock();
    const rpcErrorIdx = block.indexOf("if (rpcError)");
    const auditIdx = block.indexOf("logAuditEvent");
    const revalidateIdx = block.indexOf("revalidateFinancialSurfacesAfterPayment");
    const successIdx = block.indexOf("return { success: true }");
    assert.ok(rpcErrorIdx >= 0 && auditIdx > rpcErrorIdx && revalidateIdx > auditIdx);
    assert.ok(successIdx > revalidateIdx);
  });

  it("edit page redirects expected update errors instead of throwing through route", () => {
    const src = readFileSync(EDIT_PAGE, "utf8");
    assert.match(src, /isExpectedPaymentManualRpcError/);
    assert.match(src, /redirect\([\s\S]*\/edit\?error=/);
    assert.match(src, /submitError=\{submitError\}/);
    assert.doesNotMatch(
      src,
      /if \(result && "error" in result\) \{\s*throw new Error\(result\.error\);\s*\}/
    );
  });

  it("PaymentForm renders submitError banner", () => {
    const src = readFileSync("app/[workspaceId]/payments/_components/PaymentForm.tsx", "utf8");
    assert.match(src, /submitError\?: string/);
    assert.match(src, /\{submitError \? \(/);
  });

  it("edit path regression remains passing", () => {
    const src = readFileSync(EDIT_PAGE, "utf8");
    assert.match(src, /isExpectedPaymentManualRpcError/);
    assert.match(src, /redirect\([\s\S]*\/edit\?error=/);
    assert.match(src, /submitError=\{submitError\}/);
  });
});
