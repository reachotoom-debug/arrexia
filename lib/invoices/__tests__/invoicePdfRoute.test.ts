import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildInvoicePdfApiPath } from "@/lib/invoices/invoice-pdf-route";
import { hydratePrintableInvoice } from "@/lib/invoices/hydratePrintableInvoice";

const WORKSPACE_ID = "ws-pdf-test-0000-0000-0000-000000000001";
const INVOICE_ID = "inv-pdf-test-0000-0000-0000-000000000001";

describe("invoice PDF download routing", () => {
  it("DownloadInvoicePdfButton targets the live PDF API route", () => {
    const pageSrc = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );
    const buttonSrc = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/_components/DownloadInvoicePdfButton.tsx",
      "utf8"
    );

    assert.match(pageSrc, /buildInvoicePdfApiPath\(workspaceId, invoice\.id\)/);
    assert.match(buttonSrc, /fetch\(pdfHref/);
    assert.equal(
      buildInvoicePdfApiPath(WORKSPACE_ID, INVOICE_ID),
      `/api/workspaces/${WORKSPACE_ID}/invoices/${INVOICE_ID}/pdf`
    );
  });

  it("route parameter order is workspaceId then invoiceId", () => {
    const apiRouteSrc = readFileSync(
      "app/api/workspaces/[workspaceId]/invoices/[invoiceId]/pdf/route.ts",
      "utf8"
    );
    const sharedSrc = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");

    assert.match(apiRouteSrc, /workspaceId, invoiceId/);
    assert.match(
      apiRouteSrc,
      /getInvoicePdfResponse\(workspaceId, invoiceId\)/
    );
    assert.match(sharedSrc, /\.eq\("id", invoiceId\)/);
    assert.match(sharedSrc, /\.eq\("workspace_id", workspaceId\)/);
  });
});

describe("invoice PDF route security contract", () => {
  it("validates workspace membership before invoice lookup", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(src, /const auth = await requireWorkspaceForApi\(workspaceId\)/);
    assert.match(src, /if \(!auth\.ok\)/);
    assert.match(src, /status: auth\.status/);
  });

  it("scopes invoice query to workspace and returns safe 404 when missing", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(src, /\.eq\("id", invoiceId\)/);
    assert.match(src, /\.eq\("workspace_id", workspaceId\)/);
    assert.match(src, /status: 404/);
    assert.doesNotMatch(src, /country_code/);
  });

  it("loads client data in a workspace-scoped follow-up query", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(src, /\.from\("clients"\)/);
    assert.match(src, /\.eq\("workspace_id", workspaceId\)/);
  });

  it("continues to render through InvoicePdfDocument", () => {
    const pdfSrc = readFileSync("lib/invoices/pdf.tsx", "utf8");
    const routeSrc = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(pdfSrc, /InvoicePdfDocument/);
    assert.match(routeSrc, /generateInvoicePdf\(printableInvoice\)/);
  });

  it("does not use service-role client in the PDF route", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(src, /supabaseServer\(\)/);
    assert.doesNotMatch(src, /supabaseAdmin\(\)/);
  });

  it("legacy workspace route delegates to shared handler", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts",
      "utf8"
    );
    assert.match(src, /getInvoicePdfResponse\(workspaceId, invoiceId\)/);
    assert.doesNotMatch(src, /country_code/);
  });
});

describe("invoice PDF financial rendering", () => {
  it("partially paid invoice preserves total, paid, and outstanding from invoices_view", () => {
    const printable = hydratePrintableInvoice({
      invoice: {
        id: INVOICE_ID,
        invoice_number: "INV-1001",
        issue_date: "2026-08-01",
        due_date: "2026-08-15",
        status: "sent",
        currency: "USD",
        notes: null,
        subtotal: 100,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: 0,
        tax_amount: 0,
        amount: 100,
        payment_terms: "net_30",
        payment_terms_days: 30,
      },
      items: [{ name: "Consulting", quantity: 1, unit_price: 100 }],
      settings: null,
      client: { name: "Acme", email: "billing@acme.test", company: null, country: null, whatsapp_phone: null, whatsapp: null },
      displayStatus: "partially_paid",
      invoiceView: { paid: 40, outstanding: 60 },
      payments: [{ amount: 40, status: "completed", archived_at: null }],
    });

    assert.equal(printable.total, 100);
    assert.equal(printable.amountPaid, 40);
    assert.equal(printable.outstanding, 60);
  });

  it("does not introduce entitlement guard changes into PDF download path", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.doesNotMatch(src, /entitlementGuard/);
    assert.doesNotMatch(src, /getWorkspaceEntitlement/);
    assert.doesNotMatch(src, /assertInvoiceCreateEntitlement/);
  });
});

describe("launch blocker invoice PDF contract", () => {
  it("P1 — invoice PDF route validates workspace membership and scopes invoice query", () => {
    const src = readFileSync("lib/invoices/invoice-pdf-route.ts", "utf8");
    assert.match(src, /requireWorkspaceForApi\(workspaceId\)/);
    assert.match(src, /if \(!auth\.ok\)/);
    assert.match(src, /\.eq\("workspace_id", workspaceId\)/);
  });
});
