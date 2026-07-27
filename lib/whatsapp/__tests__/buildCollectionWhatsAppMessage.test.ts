import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";

describe("buildCollectionWhatsAppMessage", () => {
  it("includes businessName in opening line and signature", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Acme Corp",
      businessName: "FlowCollect LLC",
      invoiceNumber: "INV-100",
      outstanding: 500,
      currency: "USD",
      dueDate: "2026-07-01",
      daysOverdue: 12,
    });

    assert.match(message, /Hi Acme Corp,/);
    assert.match(
      message,
      /This is a payment reminder from FlowCollect LLC regarding invoice INV-100\./
    );
    assert.match(message, /Thank you,\nFlowCollect LLC/);
  });

  it("includes Powered by Arrexia footer once", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Acme Corp",
      businessName: "FlowCollect LLC",
      invoiceNumber: "INV-100",
      outstanding: 500,
      currency: "USD",
      dueDate: "2026-07-01",
      daysOverdue: 0,
    });

    assert.match(message, /Powered by Arrexia$/);
    assert.equal((message.match(/Powered by Arrexia/g) ?? []).length, 1);
  });

  it("partially paid invoice uses outstanding balance in message", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Beta LLC",
      businessName: "FlowCollect LLC",
      invoiceNumber: "INV-200",
      outstanding: 250.5,
      currency: "USD",
      dueDate: "2026-06-15",
      daysOverdue: 5,
    });

    assert.match(message, /Outstanding: \$250\.50/);
    assert.match(message, /This invoice is 5 days overdue\./);
  });

  it("non-overdue invoice does not mention days overdue", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Gamma Inc",
      businessName: "FlowCollect LLC",
      invoiceNumber: "INV-300",
      outstanding: 100,
      currency: "USD",
      dueDate: "2026-08-01",
      daysOverdue: 0,
    });

    assert.doesNotMatch(message, /days overdue/i);
  });

  it("missing optional values handled safely", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: null,
      businessName: null,
      invoiceNumber: null,
      outstanding: 0,
      currency: null,
      dueDate: null,
      daysOverdue: 0,
    });

    assert.match(message, /Hi there,/);
    assert.match(message, /from Your company regarding invoice your invoice/);
    assert.match(message, /Outstanding: \$0\.00/);
    assert.match(message, /Due date: —/);
    assert.match(message, /Thank you,\nYour company/);
  });
});
