import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoiceFormSchema } from "../schema";

const invoice = {
  clientId: "920e94a6-246f-49c0-a4a7-9f5a2cfcd694",
  issueDate: "2026-10-01",
  status: "draft",
  paymentTerms: "net_30",
  items: [{ name: "Service", quantity: 1, unit_price: 100 }],
};

test("allows editing invoices with imported number formats", () => {
  for (const invoiceNumber of ["TEST-IMP-004", "INV-100", "2026/0047"]) {
    const result = InvoiceFormSchema.safeParse({ ...invoice, invoiceNumber });
    assert.equal(result.success, true, `Rejected ${invoiceNumber}`);
  }
});

test("continues accepting generated invoice numbers", () => {
  const result = InvoiceFormSchema.safeParse({
    ...invoice,
    invoiceNumber: "INV-0047",
  });
  assert.equal(result.success, true);
});

test("rejects empty or whitespace-only invoice numbers", () => {
  for (const invoiceNumber of ["", "   "]) {
    const result = InvoiceFormSchema.safeParse({ ...invoice, invoiceNumber });
    assert.equal(result.success, false);
  }
});
