import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";

describe("buildCollectionWhatsAppMessage", () => {
  it("G — overdue invoice includes days overdue line", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Acme Corp",
      invoiceNumber: "INV-100",
      outstanding: 500,
      currency: "USD",
      dueDate: "2026-07-01",
      daysOverdue: 12,
    });

    assert.match(message, /Hi Acme Corp,/);
    assert.match(message, /invoice INV-100/);
    assert.match(message, /Outstanding: \$500\.00/);
    assert.match(message, /Due date: Jul 1, 2026/);
    assert.match(message, /This invoice is 12 days overdue\./);
    assert.match(message, /Please let us know once payment has been arranged\./);
    assert.match(message, /Thank you\./);
  });

  it("H — partially paid invoice uses outstanding balance in message", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Beta LLC",
      invoiceNumber: "INV-200",
      outstanding: 250.5,
      currency: "USD",
      dueDate: "2026-06-15",
      daysOverdue: 5,
    });

    assert.match(message, /Outstanding: \$250\.50/);
    assert.doesNotMatch(message, /\$1,000/);
  });

  it("I — non-overdue invoice does not mention days overdue", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: "Gamma Inc",
      invoiceNumber: "INV-300",
      outstanding: 100,
      currency: "USD",
      dueDate: "2026-08-01",
      daysOverdue: 0,
    });

    assert.doesNotMatch(message, /days overdue/i);
  });

  it("J — missing optional values handled safely", () => {
    const message = buildCollectionWhatsAppMessage({
      clientName: null,
      invoiceNumber: null,
      outstanding: 0,
      currency: null,
      dueDate: null,
      daysOverdue: 0,
    });

    assert.match(message, /Hi there,/);
    assert.match(message, /invoice your invoice/);
    assert.match(message, /Outstanding: \$0\.00/);
    assert.match(message, /Due date: —/);
    assert.doesNotMatch(message, /days overdue/i);
  });
});
