import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateCollectionMessageOutput } from "@/lib/ai/validateCollectionMessageOutput";

const invoiceNumber = "INV-100";
const outstandingFormatted = "$500.00";

const validMessage = `Hi Acme Corp,

This is a payment reminder from FlowCollect LLC regarding invoice INV-100.
Outstanding: $500.00
Due date: Jul 1, 2026
This invoice is 12 days overdue.

Please confirm once payment has been arranged.

Thank you,
FlowCollect LLC
Powered by Arrexia`;

describe("validateCollectionMessageOutput", () => {
  it("J — valid message accepted", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage,
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message, validMessage);
    }
  });

  it("K — missing invoice number rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace("INV-100", "INV-999"),
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, false);
  });

  it("L — changed/missing outstanding rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace("$500.00", "$999.00"),
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, false);
  });

  it("M — HTML rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}<script>alert(1)</script>`,
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, false);
  });

  it("N — unexpected URL rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}\nPay at https://evil.example/pay`,
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, false);
  });

  it("O — excessive length rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}${"x".repeat(1300)}`,
      invoiceNumber,
      outstandingFormatted,
    });
    assert.equal(result.ok, false);
  });
});
