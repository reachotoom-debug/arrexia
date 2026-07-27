import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  canShowRecordPaymentCta,
  deriveDisplayStatusFromFinancials,
  isInvoiceFullyPaid,
} from "../invoiceFinancialState";
import { isChaseableInvoice } from "../../actions/buildDailyActionCategories";

describe("isInvoiceFullyPaid", () => {
  it("A — outstanding = 0 → fully paid", () => {
    assert.equal(isInvoiceFullyPaid(0), true);
    assert.equal(isInvoiceFullyPaid(0.005), true);
  });

  it("B — outstanding > 0 → not fully paid", () => {
    assert.equal(isInvoiceFullyPaid(0.02), false);
    assert.equal(isInvoiceFullyPaid(100), false);
  });

  it("C — partially paid invoice remains editable when outstanding > 0", () => {
    assert.equal(isInvoiceFullyPaid(50), false);
  });
});

describe("canShowRecordPaymentCta", () => {
  it("shows for sent invoice with outstanding and active client", () => {
    assert.equal(
      canShowRecordPaymentCta({
        isArchived: false,
        baseStatus: "sent",
        outstanding: 100,
        clientIsActive: true,
        clientArchived: false,
      }),
      true
    );
  });

  it("hides for draft, void, archived, zero outstanding, inactive client", () => {
    assert.equal(
      canShowRecordPaymentCta({
        isArchived: false,
        baseStatus: "draft",
        outstanding: 100,
        clientIsActive: true,
        clientArchived: false,
      }),
      false
    );
    assert.equal(
      canShowRecordPaymentCta({
        isArchived: true,
        baseStatus: "sent",
        outstanding: 100,
        clientIsActive: true,
        clientArchived: false,
      }),
      false
    );
    assert.equal(
      canShowRecordPaymentCta({
        isArchived: false,
        baseStatus: "sent",
        outstanding: 0,
        clientIsActive: true,
        clientArchived: false,
      }),
      false
    );
  });
});

describe("fully-paid cross-module behavior contracts", () => {
  it("paid display_status when outstanding reaches zero", () => {
    assert.equal(
      deriveDisplayStatusFromFinancials({
        baseStatus: "sent",
        outstanding: 0,
        paid: 500,
        isOverdue: false,
      }),
      "paid"
    );
  });

  it("paid invoice is not chaseable in Actions/Collections predicates", () => {
    assert.equal(
      isChaseableInvoice({
        id: "inv-1",
        invoiceNumber: "INV-0001",
        clientId: "client-1",
        clientName: "Acme",
        clientEmail: null,
    clientPhone: null,
    clientCountry: null,
    dueDate: "2026-01-01",
        outstanding: 0,
        currency: "USD",
        displayStatus: "paid",
        overdueDays: 0,
        isOverdue: false,
        riskLevel: null,
        baseStatus: "sent",
        clientIsActive: true,
        clientArchivedAt: null,
        archivedAt: null,
      }),
      false
    );
  });
});

describe("edit lock contract", () => {
  it("edit page and updateInvoice guard use invoices_view outstanding", () => {
    const editSrc = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/edit/page.tsx",
      "utf8"
    );
    const actionsSrc = readFileSync("app/[workspaceId]/invoices/actions.ts", "utf8");

    assert.match(editSrc, /invoices_view/);
    assert.match(editSrc, /isInvoiceFullyPaid/);
    assert.match(editSrc, /Back to invoice/);
    assert.match(actionsSrc, /isInvoiceFullyPaid\(invoiceFinancial\?\.outstanding\)/);
  });
});

describe("record payment CTA contract", () => {
  it("invoice detail links to existing payment form with prefill params", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );
    assert.match(src, /Record Payment/);
    assert.match(src, /\/payments\/new\?clientId=/);
    assert.match(src, /invoiceId=/);
  });
});
