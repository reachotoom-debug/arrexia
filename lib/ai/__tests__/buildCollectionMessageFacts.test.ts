import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCollectionMessageFacts } from "@/lib/ai/buildCollectionMessageFacts";

describe("buildCollectionMessageFacts", () => {
  it("A — uses authoritative invoice values from server data", () => {
    const facts = buildCollectionMessageFacts({
      invoice: {
        client_name: "Acme Corp",
        invoice_number: "INV-100",
        outstanding: 500,
        paid: 0,
        total: 500,
        currency: "USD",
        due_date: "2026-07-01",
        overdue_days: 12,
        is_overdue: true,
        display_status: "overdue",
      },
      businessName: "FlowCollect LLC",
      evaluationDate: "2026-07-13",
    });

    assert.equal(facts.clientName, "Acme Corp");
    assert.equal(facts.invoiceNumber, "INV-100");
    assert.equal(facts.outstanding, 500);
    assert.equal(facts.outstandingFormatted, "$500.00");
    assert.equal(facts.businessName, "FlowCollect LLC");
    assert.equal(facts.daysOverdue, 12);
    assert.equal(facts.isOverdue, true);
    assert.equal(facts.statusLine, "Status: 12 days overdue");
  });

  it("B — partially paid uses outstanding, not total", () => {
    const facts = buildCollectionMessageFacts({
      invoice: {
        client_name: "Beta LLC",
        invoice_number: "INV-200",
        outstanding: 250.5,
        paid: 749.5,
        total: 1000,
        currency: "USD",
        due_date: "2026-06-15",
        overdue_days: 5,
        is_overdue: true,
        display_status: "partially_paid",
      },
      businessName: "FlowCollect LLC",
      evaluationDate: "2026-06-20",
    });

    assert.equal(facts.partiallyPaid, true);
    assert.equal(facts.outstanding, 250.5);
    assert.equal(facts.outstandingFormatted, "$250.50");
    assert.equal(facts.amountPaidFormatted, "$749.50");
  });
});
