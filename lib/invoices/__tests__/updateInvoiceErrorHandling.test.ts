import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isExpectedUpdateInvoiceError } from "../mapUpdateInvoiceError";

const EDIT_PAGE = "app/[workspaceId]/invoices/[invoiceId]/edit/page.tsx";
const UPDATE_ACTION = "app/[workspaceId]/invoices/actions.ts";
const INVOICE_FORM = "app/[workspaceId]/invoices/_components/InvoiceForm.tsx";

function readUpdateInvoiceBlock(): string {
  const src = readFileSync(UPDATE_ACTION, "utf8");
  return src.slice(
    src.indexOf("export async function updateInvoice"),
    src.indexOf("export async function deleteInvoice")
  );
}

describe("invoice edit expected-error handling", () => {
  it("paid-floor rejection is classified as expected", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Invoice total cannot be less than the amount already paid.",
      }),
      true
    );
  });

  it("fully-paid edit rejection uses same expected contract", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Cannot edit a fully paid invoice.",
      }),
      true
    );
  });

  it("archived invoice edit rejection is expected", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Cannot edit an archived invoice. Unarchive it first.",
      }),
      true
    );
  });

  it("mapped line-item validation rejections are expected", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Failed to update invoice items: Item name is required",
      }),
      true
    );
  });

  it("raw RPC/Postgres text wrapped as generic update failure is not expected", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error:
          "Failed to update invoice: duplicate key value violates unique constraint",
        code: "23505",
      }),
      false
    );
  });

  it("load failures with raw database text are not expected", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Failed to load invoice financial state: connection terminated",
      }),
      false
    );
  });

  it("unexpected errors remain distinguishable from expected business-rule failures", () => {
    assert.equal(
      isExpectedUpdateInvoiceError({
        error: "Failed to update invoice: server closed the connection unexpectedly",
        code: "08006",
      }),
      false
    );
  });

  it("edit page redirects expected errors instead of throwing through route", () => {
    const src = readFileSync(EDIT_PAGE, "utf8");
    assert.match(src, /isExpectedUpdateInvoiceError/);
    assert.match(src, /redirect\([\s\S]*\/edit\?error=/);
    assert.match(src, /submitError=\{submitError\}/);
    assert.doesNotMatch(
      src,
      /if \(result && "error" in result\) \{\s*throw new Error\(result\.error\);\s*\}/
    );
  });

  it("edit redirect uses mapped error text only (no raw rpc passthrough)", () => {
    const src = readFileSync(EDIT_PAGE, "utf8");
    assert.match(src, /encodeURIComponent\(result\.error\)/);
    assert.doesNotMatch(src, /encodeURIComponent\(rpcError/);
  });

  it("InvoiceForm renders submit-error banner contract", () => {
    const src = readFileSync(INVOICE_FORM, "utf8");
    assert.match(src, /submitError\?: string/);
    assert.match(src, /border-red-200 bg-red-50/);
    assert.match(src, /\{submitError\}/);
  });

  it("updateInvoice returns mapped business errors without throwing", () => {
    const block = readUpdateInvoiceBlock();
    assert.match(
      block,
      /Invoice total cannot be less than the amount already paid\./
    );
    assert.match(block, /return \{ error: message \}/);
    assert.doesNotMatch(block, /throw new Error/);
  });

  it("successful update path still audits and revalidates before redirect", () => {
    const block = readUpdateInvoiceBlock();
    const rpcErrorIdx = block.indexOf("if (rpcError)");
    const auditIdx = block.indexOf("logAuditEvent");
    const revalidateIdx = block.indexOf("revalidatePath");
    const redirectIdx = block.indexOf("redirect(");
    assert.ok(rpcErrorIdx >= 0 && auditIdx > rpcErrorIdx);
    assert.ok(revalidateIdx > auditIdx && redirectIdx > revalidateIdx);
  });

  it("audit/revalidation do not run when rpcError is returned", () => {
    const block = readUpdateInvoiceBlock();
    const rpcErrorBlock = block.slice(
      block.indexOf("if (rpcError)"),
      block.indexOf("// REMOVED: total_paid")
    );
    assert.doesNotMatch(rpcErrorBlock, /logAuditEvent/);
    assert.doesNotMatch(rpcErrorBlock, /revalidatePath/);
  });
});
