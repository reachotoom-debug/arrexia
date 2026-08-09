import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DASHBOARD_VIEW_LABELS,
  DASHBOARD_VIEWS,
  resolveDashboardView,
} from "@/app/[workspaceId]/dashboard/_utils/dashboardViews";

const DASHBOARD_PAGE = "app/[workspaceId]/dashboard/page.tsx";
const KPI_ROW = "app/[workspaceId]/dashboard/_components/DashboardKpiRow.tsx";
const INSIGHT = "app/[workspaceId]/dashboard/_components/DashboardInsight.tsx";
const CTA = "app/[workspaceId]/dashboard/_components/DailyActionCenterCta.tsx";
const DATA_LOADER = "app/[workspaceId]/dashboard/_utils/dataLoader.ts";

describe("Dashboard launch coherence", () => {
  it("1 — active tabs are Overview, AR Focus, and Performance", () => {
    assert.deepEqual([...DASHBOARD_VIEWS], ["standard", "ar-focus", "owner-overview"]);
    assert.equal(DASHBOARD_VIEW_LABELS.standard, "Overview");
    assert.equal(DASHBOARD_VIEW_LABELS["ar-focus"], "AR Focus");
    assert.equal(DASHBOARD_VIEW_LABELS["owner-overview"], "Performance");

    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.match(pageSrc, /DASHBOARD_VIEW_LABELS\[tabView\]/);
    assert.match(pageSrc, /\["standard", "ar-focus", "owner-overview"\]/);
    assert.doesNotMatch(pageSrc, /CollectionsModeView/);
    assert.doesNotMatch(pageSrc, /view === "collections-mode"/);
  });

  it("2 — Collections mode is not an active Dashboard view", () => {
    assert.doesNotMatch(
      readFileSync(DASHBOARD_PAGE, "utf8"),
      /view === "collections-mode"/
    );
    assert.doesNotMatch(
      readFileSync(DASHBOARD_PAGE, "utf8"),
      /CollectionsModeView/
    );
  });

  it("3 — legacy collections-mode URL redirects safely to Overview", () => {
    const resolved = resolveDashboardView("collections-mode");
    assert.equal(resolved.view, "standard");
    assert.equal(resolved.legacyCollectionsMode, true);

    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.match(pageSrc, /viewParam === "collections-mode"/);
    assert.match(pageSrc, /redirect\(`\/\$\{workspaceId\}\/dashboard\?view=standard`\)/);
  });

  it("4 — Collections-related Dashboard copy routes to /collections", () => {
    const insightSrc = readFileSync(INSIGHT, "utf8");
    assert.match(insightSrc, /href=\{`\/\$\{workspaceId\}\/collections`\}/);
    assert.match(insightSrc, /Open Collections/);
    assert.doesNotMatch(insightSrc, /Collections Mode/i);

    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.doesNotMatch(pageSrc, /Collections Mode/i);
  });

  it("5 — Overview uses canonical getEligibleReminders for Reminders ready count", () => {
    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.match(pageSrc, /getEligibleReminders\(workspaceId\)/);
    assert.match(pageSrc, /eligibleReminders\.length/);
    assert.match(pageSrc, /Promise\.all\(\[/);
    assert.match(pageSrc, /getDashboardSummary\(workspaceId\)/);
  });

  it("6 — Reminders ready count links to /reminders", () => {
    const ctaSrc = readFileSync(CTA, "utf8");
    assert.match(ctaSrc, /Reminders ready:/);
    assert.match(ctaSrc, /href=\{`\/\$\{workspaceId\}\/reminders`\}/);
  });

  it("7 — Overview does not show DSO: 0 days as empty-data fallback", () => {
    const insightSrc = readFileSync(INSIGHT, "utf8");
    assert.doesNotMatch(insightSrc, /DSO:/);
    assert.doesNotMatch(insightSrc, /0 days/);

    const kpiSrc = readFileSync(KPI_ROW, "utf8");
    assert.doesNotMatch(kpiSrc, /title="DSO"/);
    assert.match(kpiSrc, /avgPaymentTermsDays !== null/);
    assert.match(kpiSrc, /: "—"/);
  });

  it("8 — Overview KPI does not label payment terms as DSO", () => {
    const kpiSrc = readFileSync(KPI_ROW, "utf8");
    assert.match(kpiSrc, /title="Avg Payment Terms"/);
    assert.match(kpiSrc, /Issue to due/);
    assert.doesNotMatch(kpiSrc, /\bDSO\b/);
  });

  it("9 — Collection Rate formula remains lifetime collected / lifetime invoiced", () => {
    const kpiSrc = readFileSync(KPI_ROW, "utf8");
    assert.match(
      kpiSrc,
      /totals\.totalCollected \/ totals\.totalInvoiced\) \* 100/
    );

    const loaderSrc = readFileSync(DATA_LOADER, "utf8");
    assert.match(loaderSrc, /totalCollectedAllTime = safeInvoices\.reduce/);
    assert.match(loaderSrc, /totalInvoicedAllTime = safeInvoices\.reduce/);
  });

  it("10 — Collection Rate supporting copy describes lifetime paid/invoiced", () => {
    const kpiSrc = readFileSync(KPI_ROW, "utf8");
    assert.match(kpiSrc, /subtext="Lifetime paid \/ invoiced"/);
    assert.doesNotMatch(kpiSrc, /Collection efficiency/i);
  });

  it("11 — Collected Last 30 Days uses payment-date semantics and truthful subtext", () => {
    const loaderSrc = readFileSync(DATA_LOADER, "utf8");
    assert.match(loaderSrc, /sumPaymentsReceivedInLast30CalendarDays/);
    assert.match(loaderSrc, /from\("payments"\)/);
    assert.match(loaderSrc, /Payments received in the last 30 workspace-calendar days/);

    const kpiSrc = readFileSync(KPI_ROW, "utf8");
    assert.match(kpiSrc, /title="Collected \(Last 30 Days\)"/);
    assert.match(kpiSrc, /Payments received · workspace calendar/);
  });

  it("12 — AR Focus remains wired on the Dashboard route", () => {
    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.match(pageSrc, /ArFocusView/);
    assert.match(pageSrc, /view === "ar-focus"/);
    assert.match(pageSrc, /getDashboardData\(workspaceId\)/);
  });

  it("13 — Performance (owner-overview) remains wired after rename", () => {
    const pageSrc = readFileSync(DASHBOARD_PAGE, "utf8");
    assert.match(pageSrc, /OwnerOverviewView/);
    assert.match(pageSrc, /view === "owner-overview"/);
    assert.match(pageSrc, /Performance Snapshot/);
  });
});
