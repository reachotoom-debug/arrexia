import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateCollectionMessageOutput } from "@/lib/ai/validateCollectionMessageOutput";

const invoiceNumber = "INV-100";
const outstandingFormatted = "$500.00";
const dueDateFormatted = "Jul 1, 2026";
const statusLine = "Status: 12 days overdue";

const validMessage = `Hello Acme Corp,

This is a payment reminder from FlowCollect LLC regarding invoice INV-100.
Outstanding: $500.00
Due date: Jul 1, 2026
Status: 12 days overdue

Please let us know once payment has been arranged.
If payment has already been made, kindly disregard this reminder.

Thank you,
FlowCollect LLC
Powered by Arrexia
https://arrexia.app`;

describe("validateCollectionMessageOutput", () => {
  it("J — valid message with official URL is accepted", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage,
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
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
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("L — changed/missing outstanding rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace("$500.00", "$999.00"),
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("M — HTML rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}<script>alert(1)</script>`,
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("N — unexpected URL rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}\nPay at https://evil.example/pay`,
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("O — excessive length rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}${"x".repeat(1300)}`,
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("wrong overdue status rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace(statusLine, "Status: 99 days overdue"),
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "missing_status");
    }
  });

  it("missing status line rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace(`${statusLine}\n\n`, ""),
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("duplicated Arrexia URL rejected", () => {
    const result = validateCollectionMessageOutput({
      message: `${validMessage}\nhttps://arrexia.app`,
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });

  it("duplicated footer rejected", () => {
    const result = validateCollectionMessageOutput({
      message: validMessage.replace(
        "Powered by Arrexia",
        "Powered by Arrexia\nPowered by Arrexia"
      ),
      invoiceNumber,
      outstandingFormatted,
      dueDateFormatted,
      statusLine,
    });
    assert.equal(result.ok, false);
  });
});
