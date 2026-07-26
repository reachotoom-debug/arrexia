import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isChaseableInvoice } from "../../actions/buildDailyActionCategories";
import {
  countsTowardClientCollectibleOutstanding,
  getPaymentCreationBlockReason,
  isOperationalReceivableClient,
  isOperationalReceivableInvoice,
  paymentCreationBlockMessage,
} from "../operationalEligibility";

const baseChaseableRow = {
  id: "inv-1",
  invoiceNumber: "INV-0001",
  clientId: "client-1",
  clientName: "Acme",
  clientEmail: null,
  dueDate: "2026-07-01",
  outstanding: 100,
  currency: "USD",
  displayStatus: "overdue",
  baseStatus: "sent",
  isOverdue: true,
  overdueDays: 10,
  riskLevel: "high" as const,
  clientIsActive: true,
  clientArchivedAt: null,
  archivedAt: null,
};

describe("isOperationalReceivableClient", () => {
  it("A/B — inactive and archived clients are not operational", () => {
    assert.equal(
      isOperationalReceivableClient({ isActive: false, archivedAt: null }),
      false
    );
    assert.equal(
      isOperationalReceivableClient({
        isActive: true,
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
      false
    );
    assert.equal(
      isOperationalReceivableClient({ isActive: true, archivedAt: null }),
      true
    );
  });
});

describe("getPaymentCreationBlockReason", () => {
  it("C/D — inactive and archived client payments rejected server-side", () => {
    assert.equal(
      getPaymentCreationBlockReason({
        clientArchived: true,
        clientIsActive: true,
        invoiceArchived: false,
        baseStatus: "sent",
        outstanding: 100,
      }),
      "archived_client"
    );
    assert.equal(
      getPaymentCreationBlockReason({
        clientArchived: false,
        clientIsActive: false,
        invoiceArchived: false,
        baseStatus: "sent",
        outstanding: 100,
      }),
      "inactive_client"
    );
    assert.equal(
      paymentCreationBlockMessage("inactive_client"),
      "Cannot create payment for inactive client"
    );
  });

  it("E/F/G — archived, draft, and paid invoices blocked", () => {
    assert.equal(
      getPaymentCreationBlockReason({
        clientArchived: false,
        clientIsActive: true,
        invoiceArchived: true,
        baseStatus: "sent",
        outstanding: 100,
      }),
      "archived_invoice"
    );
    assert.equal(
      getPaymentCreationBlockReason({
        clientArchived: false,
        clientIsActive: true,
        invoiceArchived: false,
        baseStatus: "draft",
        outstanding: 100,
      }),
      "draft_invoice"
    );
    assert.equal(
      getPaymentCreationBlockReason({
        clientArchived: false,
        clientIsActive: true,
        invoiceArchived: false,
        baseStatus: "sent",
        outstanding: 0,
      }),
      "fully_paid"
    );
  });
});

describe("isOperationalReceivableInvoice", () => {
  it("H/K/M — inactive/archived clients and archived invoices excluded from operational AR", () => {
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: null,
        baseStatus: "sent",
        outstanding: 100,
        clientIsActive: false,
        clientArchivedAt: null,
      }),
      false
    );
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: null,
        baseStatus: "sent",
        outstanding: 100,
        clientIsActive: true,
        clientArchivedAt: "2026-01-01",
      }),
      false
    );
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: "2026-01-01",
        baseStatus: "sent",
        outstanding: 100,
        clientIsActive: true,
        clientArchivedAt: null,
      }),
      false
    );
  });

  it("N — restored invoice re-enters workflows only when otherwise eligible", () => {
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: null,
        baseStatus: "sent",
        outstanding: 50,
        clientIsActive: true,
        clientArchivedAt: null,
      }),
      true
    );
    assert.equal(
      isOperationalReceivableInvoice({
        archivedAt: null,
        baseStatus: "draft",
        outstanding: 50,
        clientIsActive: true,
        clientArchivedAt: null,
      }),
      false
    );
    assert.equal(isChaseableInvoice(baseChaseableRow), true);
    assert.equal(
      isChaseableInvoice({ ...baseChaseableRow, archivedAt: "2026-01-01" }),
      false
    );
  });
});

describe("countsTowardClientCollectibleOutstanding", () => {
  it("P — draft invoices excluded from collectible client KPI outstanding", () => {
    assert.equal(
      countsTowardClientCollectibleOutstanding({
        displayStatus: "draft",
        baseStatus: "draft",
      }),
      false
    );
    assert.equal(
      countsTowardClientCollectibleOutstanding({
        displayStatus: "overdue",
        baseStatus: "sent",
      }),
      true
    );
  });
});

describe("integration contracts", () => {
  it("O — client search includes persisted whatsapp field", () => {
    const src = readFileSync("app/[workspaceId]/clients/page.tsx", "utf8");
    assert.match(src, /whatsapp\.ilike\.\$\{searchPattern\}/);
  });

  it("I/J — manual/cron reminder paths require active clients", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    const loaderSrc = readFileSync("lib/reminders/getEligibleReminders.ts", "utf8");
    const eligibilitySrc = readFileSync("lib/reminders/eligibility.ts", "utf8");

    assert.match(sendSrc, /\.eq\("is_active", true\)/);
    assert.doesNotMatch(sendSrc, /if \(!ruleId\) \{\s*eligibleClientQuery = eligibleClientQuery\.eq\("is_active", true\)/);
    assert.match(loaderSrc, /\.eq\("client_is_active", true\)/);
    assert.match(eligibilitySrc, /client_inactive/);
  });

  it("client unarchive preserves is_active source of truth", () => {
    const src = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");
    assert.match(src, /export async function unarchiveClient[\s\S]*archived_at: null/);
    assert.doesNotMatch(
      src,
      /export async function unarchiveClient[\s\S]*is_active: true/
    );
  });

  it("client detail KPI excludes draft from collectible outstanding", () => {
    const src = readFileSync(
      "app/[workspaceId]/clients/[clientId]/page.tsx",
      "utf8"
    );
    assert.match(src, /countsTowardClientCollectibleOutstanding/);
    assert.match(src, /collectibleInvoices\.reduce/);
  });
});
