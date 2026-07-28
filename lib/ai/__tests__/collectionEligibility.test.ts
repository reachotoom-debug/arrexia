import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isInvoiceFullyPaid } from "@/lib/invoices/invoiceFinancialState";
import { isOperationalReceivableInvoice } from "@/lib/receivables/operationalEligibility";

describe("collection eligibility gates for AI", () => {
  it("C — paid invoice is rejected by fully-paid guard", () => {
    assert.equal(isInvoiceFullyPaid(0), true);
    assert.equal(isInvoiceFullyPaid(0.005), true);
    assert.equal(isInvoiceFullyPaid(10), false);
  });

  it("D — draft invoice is not collection-eligible", () => {
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: null,
        baseStatus: "draft",
        outstanding: 100,
        clientIsActive: true,
        clientArchivedAt: null,
      }),
      false
    );
  });
});
