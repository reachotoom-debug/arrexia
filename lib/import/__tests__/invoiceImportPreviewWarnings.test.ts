import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoiceLineAmountMismatchWarning,
  INVOICE_AMOUNT_MISMATCH_TOLERANCE,
  resolveImportedInvoiceStatus,
} from "@/lib/import/invoiceImportPreviewWarnings";
import { runInvoiceSampleSelfTest } from "@/app/[workspaceId]/settings/import/_lib/invoicesGroupedFormat";

describe("invoice import preview warnings", () => {
  it("warns when Paid normalizes to Sent without blocking", () => {
    const result = resolveImportedInvoiceStatus("Paid");
    assert.equal(result.baseStatus, "sent");
    assert.equal(result.error, null);
    assert.match(result.warning ?? "", /Status "Paid" was normalized to "Sent"/);
    assert.match(result.warning ?? "", /determined from recorded payments/);
  });

  it("warns when Overdue normalizes to Sent", () => {
    const result = resolveImportedInvoiceStatus("Overdue");
    assert.equal(result.baseStatus, "sent");
    assert.match(result.warning ?? "", /Status "Overdue" was normalized to "Sent"/);
  });

  it("warns when Partially Paid normalizes to Sent", () => {
    const result = resolveImportedInvoiceStatus("Partially Paid");
    assert.equal(result.baseStatus, "sent");
    assert.match(result.warning ?? "", /Status "Partially Paid" was normalized to "Sent"/);
  });

  it("keeps canonical Draft/Sent/Void without warnings", () => {
    assert.deepEqual(resolveImportedInvoiceStatus("Draft"), {
      baseStatus: "draft",
      warning: null,
      error: null,
    });
    assert.deepEqual(resolveImportedInvoiceStatus("sent"), {
      baseStatus: "sent",
      warning: null,
      error: null,
    });
    assert.deepEqual(resolveImportedInvoiceStatus("Void"), {
      baseStatus: "void",
      warning: null,
      error: null,
    });
  });

  it("rejects invalid statuses as blocking errors", () => {
    const result = resolveImportedInvoiceStatus("open");
    assert.equal(result.warning, null);
    assert.match(result.error ?? "", /Invalid Status: open/);
  });

  it("amount mismatch produces non-blocking warning with calculated value", () => {
    const warning = buildInvoiceLineAmountMismatchWarning({
      providedAmount: 1000,
      computedAmount: 999.98,
      lineNumber: 3,
      invoiceNumber: "INV-0010",
      currency: "USD",
    });
    assert.ok(warning);
    assert.match(warning, /Imported amount \$1,000\.00 differs from calculated amount \$999\.98/);
    assert.match(warning, /Arrexia will use the calculated amount \$999\.98/);
  });

  it("amount mismatch within tolerance produces no warning", () => {
    const warning = buildInvoiceLineAmountMismatchWarning({
      providedAmount: 100,
      computedAmount: 100 + INVOICE_AMOUNT_MISMATCH_TOLERANCE / 2,
      lineNumber: 2,
      invoiceNumber: "INV-0001",
    });
    assert.equal(warning, null);
  });
});

describe("invoice sample contract", () => {
  it("generated TSV sample passes self-test", () => {
    const result = runInvoiceSampleSelfTest();
    assert.equal(result.passed, true, result.errors.join("; "));
    assert.ok(result.parsedInvoiceCount >= 2);
    assert.ok(result.parsedItemCount >= 3);
  });
});
