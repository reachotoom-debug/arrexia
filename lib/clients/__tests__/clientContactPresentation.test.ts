import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { hydratePrintableInvoice } from "@/lib/invoices/hydratePrintableInvoice";

describe("hydratePrintableInvoice contact fields", () => {
  it("G — separates Phone and WhatsApp on printable invoice", () => {
    const printable = hydratePrintableInvoice({
      invoice: {
        id: "inv-1",
        invoice_number: "INV-001",
        issue_date: "2026-07-01",
        due_date: "2026-07-15",
        status: "sent",
        currency: "USD",
        notes: null,
        subtotal: 100,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: 0,
        tax_amount: 0,
        amount: 100,
      },
      items: [],
      settings: null,
      client: {
        name: "Ola Otoom",
        email: "ola@example.com",
        company: null,
        country: "Germany",
        whatsapp: "49301234567",
        whatsapp_phone: null,
      },
      invoiceView: { paid: 0, outstanding: 100 },
    });

    assert.equal(printable.clientPhone, "49301234567");
    assert.equal(printable.clientWhatsApp, null);
  });

  it("G — both numbers preserved separately", () => {
    const printable = hydratePrintableInvoice({
      invoice: {
        id: "inv-2",
        invoice_number: "INV-002",
        issue_date: "2026-07-01",
        due_date: "2026-07-15",
        status: "sent",
        currency: "JOD",
        notes: null,
        subtotal: 50,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: 0,
        tax_amount: 0,
        amount: 50,
      },
      items: [],
      settings: null,
      client: {
        name: "Both Co",
        email: null,
        company: null,
        country: "Jordan",
        whatsapp: "+96265551234",
        whatsapp_phone: "+962795556789",
      },
      invoiceView: { paid: 0, outstanding: 50 },
    });

    assert.equal(printable.clientPhone, "+96265551234");
    assert.equal(printable.clientWhatsApp, "+962795556789");
  });
});

describe("client export contact columns", () => {
  it("F — export route maps Phone and WhatsApp separately", () => {
    const src = readFileSync("app/api/export/clients/route.ts", "utf8");
    assert.match(src, /Phone: client\.whatsapp/);
    assert.match(src, /WhatsApp: client\.whatsapp_phone/);
    assert.doesNotMatch(src, /whatsapp_phone \|\| client\.whatsapp/);
  });
});

describe("client form independent fields", () => {
  it("E — create/update write phone and whatsapp_phone independently", () => {
    const src = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");
    assert.match(src, /whatsapp: parsed\.phone/);
    assert.match(src, /whatsapp_phone: parsed\.whatsapp/);
  });

  it("E — edit form loads both contact fields", () => {
    const formSrc = readFileSync("app/[workspaceId]/clients/_components/ClientForm.tsx", "utf8");
    const editSrc = readFileSync("app/[workspaceId]/clients/[clientId]/edit/page.tsx", "utf8");
    assert.match(formSrc, /ClientContactNumberInput/);
    assert.match(formSrc, /id="client-phone"/);
    assert.match(formSrc, /id="client-whatsapp"/);
    assert.match(formSrc, /storedValue=\{phoneValue\}/);
    assert.match(formSrc, /storedValue=\{whatsappValue\}/);
    assert.match(editSrc, /getClientPhone/);
    assert.match(editSrc, /getClientWhatsApp/);
  });
});

describe("WhatsApp resolver contract", () => {
  it("uses whatsapp_phone only in daily action loader", () => {
    const src = readFileSync("lib/actions/getDailyActionCenterData.ts", "utf8");
    assert.match(src, /clientPhone: resolveClientWhatsAppPhone\(contact\?\.whatsappPhone\)/);
  });
});
