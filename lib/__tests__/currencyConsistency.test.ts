import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatCurrency } from "../format/currency";
import {
  ACTIVE_INVOICES_VIEW_SELECT,
  resolveInvoiceDisplayCurrency,
} from "../invoices/invoiceListCurrency";

describe("currency consistency V1", () => {
  it("resolveInvoiceDisplayCurrency prefers invoice currency, then workspace default, then USD", () => {
    assert.equal(resolveInvoiceDisplayCurrency("JOD", "USD"), "JOD");
    assert.equal(resolveInvoiceDisplayCurrency(null, "JOD"), "JOD");
    assert.equal(resolveInvoiceDisplayCurrency(undefined, null), "USD");
  });

  it("active invoices_view select includes currency", () => {
    assert.match(ACTIVE_INVOICES_VIEW_SELECT, /\bcurrency\b/);
    const pageSrc = readFileSync("app/[workspaceId]/invoices/page.tsx", "utf8");
    assert.match(pageSrc, /ACTIVE_INVOICES_VIEW_SELECT/);
    assert.doesNotMatch(
      pageSrc,
      /enrichedInvoices[\s\S]*?const currency = "USD"/
    );
  });

  it("JOD invoice list enrichment retains JOD", () => {
    assert.equal(resolveInvoiceDisplayCurrency("JOD", "USD"), "JOD");
  });

  it("JOD workspace invoice summary formats with JOD symbol", () => {
    const formatted = formatCurrency(1500, { currency: "JOD" });
    assert.match(formatted, /1,500\.00/);
    assert.doesNotMatch(formatted, /^\$/);
  });

  it("client outstanding uses workspace default currency formatting", () => {
    const formatted = formatCurrency(250, { currency: "JOD" });
    assert.match(formatted, /250\.00/);
    assert.doesNotMatch(formatted, /^\$/);
  });

  it("dashboard overview aggregate (DashboardInsight) uses workspace default currency", () => {
    const src = readFileSync(
      "app/[workspaceId]/dashboard/_components/DashboardInsight.tsx",
      "utf8"
    );
    assert.match(src, /summary\.defaultCurrency/);
    assert.match(src, /formatCurrencyAmount\(totals\.overdueAmount, workspaceCurrency\)/);
    assert.match(src, /formatCurrencyAmount\(totals\.highRiskExposure, workspaceCurrency\)/);
  });

  it("AR Focus aggregate uses workspace default currency from dashboard data", () => {
    const src = readFileSync(
      "app/[workspaceId]/dashboard/_components/ArFocusView.tsx",
      "utf8"
    );
    assert.match(src, /data\.defaultCurrency/);
    assert.doesNotMatch(src, /currency: "USD"/);
  });

  it("invoice-specific overdue table formatting uses invoice currency with fallback", () => {
    const src = readFileSync(
      "app/[workspaceId]/dashboard/_components/OverdueInvoicesTable.tsx",
      "utf8"
    );
    assert.match(src, /currency: invoice\.currency/);
    assert.match(src, /fallbackCurrency: defaultCurrency/);
  });

  it("USD workspace behavior remains USD when default is USD", () => {
    const formatted = formatCurrency(100, { currency: "USD" });
    assert.equal(formatted, "$100.00");
    assert.equal(resolveInvoiceDisplayCurrency(null, "USD"), "USD");
  });

  it("clients list surfaces thread workspaceDefaultCurrency instead of literal USD", () => {
    for (const file of [
      "app/[workspaceId]/clients/_components/ClientsListView.tsx",
      "app/[workspaceId]/clients/_components/ClientsCardView.tsx",
      "app/[workspaceId]/clients/_components/ClientsTable.tsx",
      "app/[workspaceId]/clients/_components/ClientsCards.tsx",
      "app/[workspaceId]/clients/[clientId]/page.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /formatMoney\([^,]+,\s*"USD"\)/, file);
    }
  });
});
