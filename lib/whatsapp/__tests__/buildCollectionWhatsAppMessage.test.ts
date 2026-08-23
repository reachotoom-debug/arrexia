import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ARREXIA_WEBSITE_URL,
  formatCollectionMessageStatusLine,
} from "@/lib/collections/collectionMessageFormat";
import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";

const baseInput = {
  clientName: "Acme Corp",
  businessName: "FlowCollect LLC",
  invoiceNumber: "INV-100",
  outstanding: 500,
  currency: "USD",
  dueDate: "2026-07-01",
  evaluationDate: "2026-07-15",
};

describe("buildCollectionWhatsAppMessage", () => {
  it("includes businessName in opening line and signature", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 12,
    });

    assert.match(message, /Hello Acme Corp,/);
    assert.match(
      message,
      /This is a payment reminder from FlowCollect LLC regarding invoice INV-100\./
    );
    assert.match(message, /Thank you,\nFlowCollect LLC/);
  });

  it("overdue message includes scan-friendly fact lines", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 14,
    });

    assert.match(message, /Outstanding: \$500\.00/);
    assert.match(message, /Due date: Jul 1, 2026/);
    assert.match(message, /Status: 14 days overdue/);
  });

  it("singular overdue wording", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 1,
    });

    assert.match(message, /Status: 1 day overdue/);
  });

  it("due-today wording uses authoritative evaluationDate", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      dueDate: "2026-08-01",
      daysOverdue: 0,
      evaluationDate: "2026-08-01",
    });

    assert.match(message, /Status: Due today/);
  });

  it("pre-due wording uses authoritative evaluationDate", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      dueDate: "2026-08-04",
      daysOverdue: 0,
      evaluationDate: "2026-08-01",
    });

    assert.match(message, /Status: Due in 3 days/);
  });

  it("includes improved CTA and already-paid disclaimer", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 5,
    });

    assert.match(message, /Please let us know once payment has been arranged\./);
    assert.match(
      message,
      /If payment has already been made, kindly disregard this reminder\./
    );
  });

  it("includes branded footer and official URL exactly once", () => {
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 0,
      evaluationDate: "2026-08-01",
      dueDate: "2026-08-01",
    });

    assert.match(message, /Powered by Arrexia\nhttps:\/\/arrexia\.app$/);
    assert.equal((message.match(/Powered by Arrexia/g) ?? []).length, 1);
    assert.equal((message.match(/^https:\/\/arrexia\.app$/gm) ?? []).length, 1);
  });

  it("includes public invoice URL when provided without duplicating root URL line", () => {
    const publicUrl = "http://localhost:3000/i/abcdefghijklmnopqrstuvwxyz012345";
    const message = buildCollectionWhatsAppMessage({
      ...baseInput,
      daysOverdue: 5,
      publicInvoiceUrl: publicUrl,
    });

    assert.match(message, new RegExp(`View invoice:\\n${publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal((message.match(/^https:\/\/arrexia\.app$/gm) ?? []).length, 1);
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
      evaluationDate: "2026-06-20",
    });

    assert.match(message, /Outstanding: \$250\.50/);
    assert.match(message, /Status: 5 days overdue/);
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

    assert.match(message, /Hello there,/);
    assert.match(message, /from Your company regarding invoice your invoice/);
    assert.match(message, /Outstanding: \$0\.00/);
    assert.match(message, /Due date: —/);
    assert.match(message, /Thank you,\nYour company/);
  });
});

describe("formatCollectionMessageStatusLine date authority", () => {
  it("does not rely on new Date() in shared formatter source", () => {
    const src = readFileSync("lib/collections/collectionMessageFormat.ts", "utf8");
    assert.doesNotMatch(src, /new Date\(/);
  });

  it("overdue status ignores evaluationDate and browser clock", () => {
    assert.equal(
      formatCollectionMessageStatusLine({
        daysOverdue: 14,
        dueDate: "2026-07-01",
        evaluationDate: "2099-01-01",
      }),
      "Status: 14 days overdue"
    );
  });

  it("due today boundary uses workspace evaluationDate", () => {
    assert.equal(
      formatCollectionMessageStatusLine({
        daysOverdue: 0,
        dueDate: "2026-08-01",
        evaluationDate: "2026-08-01",
      }),
      "Status: Due today"
    );
  });

  it("due tomorrow boundary uses workspace evaluationDate", () => {
    assert.equal(
      formatCollectionMessageStatusLine({
        daysOverdue: 0,
        dueDate: "2026-08-02",
        evaluationDate: "2026-08-01",
      }),
      "Status: Due in 1 day"
    );
  });

  it("one day overdue boundary from evaluationDate when daysOverdue is 0", () => {
    assert.equal(
      formatCollectionMessageStatusLine({
        daysOverdue: 0,
        dueDate: "2026-07-31",
        evaluationDate: "2026-08-01",
      }),
      "Status: 1 day overdue"
    );
  });

  it("requires evaluationDate when daysOverdue is 0 and dueDate is present", () => {
    assert.throws(
      () =>
        formatCollectionMessageStatusLine({
          daysOverdue: 0,
          dueDate: "2026-08-01",
        }),
      /evaluationDate is required/
    );
  });

  it("uses official Arrexia URL constant", () => {
    assert.equal(ARREXIA_WEBSITE_URL, "https://arrexia.app");
  });
});

describe("Actions and Collections pass workspace evaluationDate", () => {
  it("Daily Action Center passes evaluationDate into CollectionActionCell", () => {
    const viewSrc = readFileSync(
      "app/[workspaceId]/actions/_components/DailyActionCenterView.tsx",
      "utf8"
    );
    const cellSrc = readFileSync(
      "app/[workspaceId]/actions/_components/CollectionActionCell.tsx",
      "utf8"
    );

    assert.match(viewSrc, /evaluationDate=\{data\.evaluationDate\}/);
    assert.match(cellSrc, /evaluationDate=\{evaluationDate\}/);
  });

  it("Collections portfolio passes evaluationDate into WhatsApp link", () => {
    const pageSrc = readFileSync("app/[workspaceId]/collections/page.tsx", "utf8");
    const cellSrc = readFileSync(
      "app/[workspaceId]/collections/_components/CollectionsPortfolioActionCell.tsx",
      "utf8"
    );

    assert.match(pageSrc, /resolveWorkspaceEvaluationDate/);
    assert.match(pageSrc, /evaluationDate=\{evaluationDate\}/);
    assert.match(cellSrc, /evaluationDate=\{evaluationDate\}/);
  });
});
