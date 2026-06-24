/**
 * Server-side dashboard data loader - Dashboard v3
 */

import { supabaseServer } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format/currency";
import type {
  DashboardData,
  DashboardSummary,
  DashboardSeries,
  RiskOverview,
  UpcomingDueItem,
  ActivityItem,
  CollectionsWorkItem,
  ArFocusData,
  OwnerOverviewData,
  CollectionsModeData,
  DashboardInsight,
  ReminderEffectivenessData,
} from "../_types/dashboard";
import type { DashboardSummaryPremium } from "../_components/PremiumKpiRow";

export type PeriodStats = {
  invoicedAmount: number;
  collectedAmount: number;
  overdueAmount: number;
  highRiskAmount: number;
  overdueCount: number;
  highRiskCount: number;
};

type RiskBucket = { invoiceCount: number; amount: number };
type RiskBuckets = { high: RiskBucket; medium: RiskBucket; low: RiskBucket };

function computeRiskBuckets(
  rows: Array<{
    riskLevel: "high" | "medium" | "low" | null;
    isOverdue: boolean;
    outstanding: number;
    clientIsActive?: boolean;
    clientArchivedAt?: string | null;
  }>,
  opts: { mode: "ledger" | "collections" }
): RiskBuckets {
  const buckets: RiskBuckets = {
    high: { invoiceCount: 0, amount: 0 },
    medium: { invoiceCount: 0, amount: 0 },
    low: { invoiceCount: 0, amount: 0 },
  };

  for (const r of rows) {
    // Risk buckets are defined by invoices_view fields only:
    // - risk_level (classification)
    // - is_overdue (overdue status)
    // - outstanding (exposure amount)
    if (!r.isOverdue) continue;
    if (!(r.outstanding > 0)) continue;
    if (!r.riskLevel) continue;

    if (opts.mode === "collections") {
      // Collections exposure: only active, non-archived clients + non-archived invoices.
      if (!r.clientIsActive) continue;
      if (r.clientArchivedAt != null) continue;
    }

    buckets[r.riskLevel].invoiceCount += 1;
    buckets[r.riskLevel].amount += r.outstanding;
  }

  return buckets;
}

// Helper functions
function calcDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  return ((current - previous) / previous) * 100;
}


function formatPercent(value: number): string {
  if (value > 0) {
    return `+${Math.round(value)}%`;
  } else if (value < 0) {
    return `${Math.round(value)}%`;
  }
  return "0%";
}

export async function getDashboardData(
  workspaceId: string
): Promise<DashboardData> {
  const supabase = await supabaseServer();

  // Fetch workspace settings for default currency (used for display/formatting only)
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("default_currency")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const workspaceCurrency = (settingsRow as { default_currency?: string } | null)?.default_currency || "USD";

  // Dashboard data powers the tab content and “Smart Risk Overview” section.
  // Top “Premium KPI” cards are powered by getDashboardSummary().

  const toNumber = (value: number | string | null): number => {
    if (value == null) return 0;
    if (typeof value === "number") return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const fourteenDaysFromNow = new Date();
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

  // --- Load invoices_view ----------------------------------------------------
  // Ledger truth: invoices_view is the single source of truth for AR fields
  // (paid, outstanding, display_status, is_overdue, overdue_days, risk_level).
  // CRITICAL: dashboard must exclude archived invoices by default.
  let invoicesRaw: Array<{
    id: string;
    workspace_id: string;
    client_id: string | null;
    client_name: string | null;
    client_is_active?: boolean | null;
    client_archived_at?: string | null;
    invoice_number: string | null;
    display_status: string | null;
    base_status: string | null;
    issue_date: string | null;
    due_date: string | null;
    total: number | string | null;
    paid: number | string | null;
    outstanding: number | string | null;
    currency: string | null;
    archived_at: string | null;
    is_overdue: boolean | null;
    overdue_days: number | null;
    risk_level: string | null;
  }> = [];

  try {
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices_view")
      .select(
        "id, workspace_id, client_id, client_name, client_is_active, client_archived_at, invoice_number, display_status, base_status, issue_date, due_date, currency, total, paid, outstanding, is_overdue, overdue_days, risk_level, archived_at"
      )
      .eq("workspace_id", workspaceId)
      // invoices_view excludes archived invoices at the SQL layer, but this explicit
      // filter keeps app behavior aligned with the contract and avoids drift.
      .is("archived_at", null);

    if (invoicesError) {
      console.error("[Dashboard] invoices_view error", invoicesError);
      invoicesRaw = [];
    } else {
      invoicesRaw = invoices ?? [];
    }
  } catch (error) {
    console.error("[Dashboard] failed to load invoices", error);
    invoicesRaw = [];
  }

  const safeInvoices = invoicesRaw.map((inv) => ({
    id: inv.id,
    clientId: inv.client_id ?? null,
    invoiceNumber: inv.invoice_number ?? "",
    clientName: inv.client_name ?? null,
    clientIsActive: Boolean(inv.client_is_active),
    clientArchivedAt: inv.client_archived_at ?? null,
    status: inv.display_status ?? "draft",
    baseStatus: inv.base_status ?? null,
    issueDate: inv.issue_date ?? null,
    dueDate: inv.due_date ?? null,
    totalAmount: toNumber(inv.total),
    paidAmount: toNumber(inv.paid),
    outstanding: toNumber(inv.outstanding),
    isOverdue: Boolean(inv.is_overdue),
    overdueDays: Number(inv.overdue_days ?? 0),
    riskLevel: (inv.risk_level as "high" | "medium" | "low" | null) ?? null,
  }));

  // Ledger AR view: all-time invoices_view rows, excluding draft/void and archived invoices. No date filter.
  const ledgerInvoices = safeInvoices.filter(
    (inv) => inv.baseStatus !== "draft" && inv.baseStatus !== "void"
  );

  // --- Load clients (for eligibility filters) --------------------------------
  // Collections exposure: align with Reminders/Collections eligibility rules.
  // Only active, non-archived clients are eligible for “chase/action” views.
  let clientsRaw: Array<{
    id: string;
    name: string | null;
    email: string | null;
    is_active: boolean | null;
    archived_at: string | null;
  }> = [];

  try {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, email, is_active, archived_at")
      .eq("workspace_id", workspaceId);

    if (clientsError) {
      console.error("[Dashboard] clients error", clientsError);
      clientsRaw = [];
    } else {
      clientsRaw = clients ?? [];
    }
  } catch (error) {
    console.error("[Dashboard] failed to load clients", error);
    clientsRaw = [];
  }

  const eligibleClients = new Map<string, { name: string | null; email: string | null }>();
  for (const c of clientsRaw) {
    const isEligible = c.is_active === true && c.archived_at == null;
    if (isEligible) {
      eligibleClients.set(c.id, { name: c.name ?? null, email: c.email ?? null });
    }
  }

  // --- Compute period stats for insight ---------------------------------------
  const periodEnd = now;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 30);
  const prevEnd = periodStart;
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - 30);

  function computePeriodStats(start: Date, end: Date): PeriodStats {
    // Invoiced amount from invoices with issue_date in [start, end]
    const invoicedAmount = safeInvoices
      .filter((inv) => {
        if (!inv.issueDate) return false;
        const issueDate = new Date(inv.issueDate);
        return issueDate >= start && issueDate <= end;
      })
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    // Collected amount from invoices_view.paid for invoices issued in [start, end]
    const collectedAmount = safeInvoices
      .filter((p) => {
        if (!p.issueDate) return false;
        const issueDate = new Date(p.issueDate);
        return issueDate >= start && issueDate <= end;
      })
      .reduce((sum, p) => sum + p.paidAmount, 0);

    // IMPORTANT: invoices_view is the source of truth for overdue.
    // Note: this is a “current-state” approximation for the insight period.
    const overdueAtEnd = ledgerInvoices.filter((inv) => inv.isOverdue && inv.outstanding > 0);

    const overdueAmount = overdueAtEnd.reduce((sum, inv) => sum + inv.outstanding, 0);
    const overdueCount = overdueAtEnd.length;

    const highRiskAtEnd = overdueAtEnd.filter((inv) => inv.riskLevel === "high");
    const highRiskAmount = highRiskAtEnd.reduce((sum, inv) => sum + inv.outstanding, 0);
    const highRiskCount = highRiskAtEnd.length;

    return {
      invoicedAmount,
      collectedAmount,
      overdueAmount,
      highRiskAmount,
      overdueCount,
      highRiskCount,
    };
  }

  const currentStats = computePeriodStats(periodStart, periodEnd);
  const previousStats = computePeriodStats(prevStart, prevEnd);

  // Default currency from workspace settings (for display/formatting only)
  const currency = workspaceCurrency;

  function buildDashboardInsight(
    current: PeriodStats,
    previous: PeriodStats,
    currencyCode: string
  ): DashboardInsight {
    const overdueDelta = calcDelta(current.overdueAmount, previous.overdueAmount);
    const highRiskDelta = calcDelta(current.highRiskAmount, previous.highRiskAmount);

    const collectionRatioCurrent =
      current.invoicedAmount > 0 ? (current.collectedAmount / current.invoicedAmount) * 100 : 0;
    const collectionRatioPrev =
      previous.invoicedAmount > 0 ? (previous.collectedAmount / previous.invoicedAmount) * 100 : 0;
    const collectionDelta = collectionRatioCurrent - collectionRatioPrev;

    // Priority 1: Overdue trending up
    if (overdueDelta !== null && overdueDelta > 20 && current.overdueAmount > 0) {
      return {
        title: "Overdue is trending up",
        message: `${current.overdueCount} overdue invoice${current.overdueCount !== 1 ? "s" : ""} totaling ${formatCurrency(current.overdueAmount, { currency: currencyCode })}. Up ${formatPercent(overdueDelta!)} from last period.`,
        severity: "warning",
        primaryMetricLabel: "Overdue Amount",
        primaryMetricValue: formatCurrency(current.overdueAmount, { currency: currencyCode }),
        deltaLabel: "Change",
        deltaValue: formatPercent(overdueDelta!),
      };
    }

    // Priority 2: High-risk invoices
    if (current.highRiskAmount > 0) {
      const deltaText = highRiskDelta !== null ? ` (${highRiskDelta > 0 ? "+" : ""}${formatPercent(highRiskDelta!)})` : "";
      return {
        title: "High-risk invoices need attention",
        message: `${current.highRiskCount} high-risk invoice${current.highRiskCount !== 1 ? "s" : ""} with ${formatCurrency(current.highRiskAmount, { currency: currencyCode })} exposure${deltaText}.`,
        severity: "warning",
        primaryMetricLabel: "High-Risk Exposure",
        primaryMetricValue: formatCurrency(current.highRiskAmount, { currency: currencyCode }),
        deltaLabel: highRiskDelta !== null ? "Change" : undefined,
        deltaValue: highRiskDelta !== null ? formatPercent(highRiskDelta) : undefined,
      };
    }

    // Priority 3: Collection rate changes
    if (collectionDelta > 5) {
      return {
        title: "Collections are improving",
        message: `Collection rate is ${collectionRatioCurrent.toFixed(1)}%, up ${collectionDelta.toFixed(1)} percentage points from last period.`,
        severity: "good",
        primaryMetricLabel: "Collection Rate",
        primaryMetricValue: `${collectionRatioCurrent.toFixed(1)}%`,
        deltaLabel: "Improvement",
        deltaValue: `+${collectionDelta.toFixed(1)}pp`,
      };
    }

    if (collectionDelta < -5) {
      return {
        title: "Collection rate is softening",
        message: `Collection rate is ${collectionRatioCurrent.toFixed(1)}%, down ${Math.abs(collectionDelta).toFixed(1)} percentage points from last period.`,
        severity: "warning",
        primaryMetricLabel: "Collection Rate",
        primaryMetricValue: `${collectionRatioCurrent.toFixed(1)}%`,
        deltaLabel: "Change",
        deltaValue: `${collectionDelta.toFixed(1)}pp`,
      };
    }

    // Default: Neutral
    return {
      title: "Steady collections this month",
      message: `Invoiced ${formatCurrency(current.invoicedAmount, { currency: currencyCode })}, collected ${formatCurrency(current.collectedAmount, { currency: currencyCode })}. ${current.overdueAmount > 0 ? `${formatCurrency(current.overdueAmount, { currency: currencyCode })} overdue.` : "No overdue invoices."}`,
      severity: "neutral",
      primaryMetricLabel: "Collected",
      primaryMetricValue: formatCurrency(current.collectedAmount, { currency: currencyCode }),
    };
  }

  const insight = buildDashboardInsight(currentStats, previousStats, currency);

  // --- Calculate summary ------------------------------------------------------
  const invoices12m = ledgerInvoices.filter(
    (inv) => inv.issueDate && new Date(inv.issueDate) >= twelveMonthsAgo
  );
  const totalInvoiced12m = invoices12m.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalCollected12m = invoices12m.reduce((sum, inv) => sum + inv.paidAmount, 0);

  // --- Ledger AR totals (live) -----------------------------------------------
  // Ledger AR view: all-time invoices_view totals, excluding draft/void and archived invoices. No date filter.
  // IMPORTANT: invoices_view is the source of truth for AR totals.
  const totalOutstandingNow = ledgerInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);

  // Overdue amount: sum of outstanding for all overdue, non-archived, non-draft/non-void invoices_view rows.
  const overdueAmountNow = ledgerInvoices
    .filter((inv) => inv.isOverdue && inv.outstanding > 0)
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Ledger truth (open overdue): relies on invoices_view.is_overdue and invoices_view.overdue_days.
  const overdueInvoices = ledgerInvoices.filter((inv) => inv.isOverdue && inv.outstanding > 0);

  // Collections exposure: source invoice set for ALL chase-style dashboard views.
  // IMPORTANT: This is the single source set for both:
  // - Smart Risk Overview (high/medium/low buckets)
  // - Collections mode worklist (table + “Outstanding in view”)
  //
  // Filters:
  // - invoices_view (already archived_at IS NULL)
  // - base_status NOT IN ('draft','void') via ledgerInvoices
  // - is_overdue = true AND outstanding > 0
  // - risk_level IN ('high','medium','low')
  // - client eligibility: active AND not archived
  const collectionsExposureInvoices = overdueInvoices.filter(
    (inv) =>
      inv.clientId != null &&
      inv.clientIsActive &&
      inv.clientArchivedAt == null &&
      (inv.riskLevel === "high" || inv.riskLevel === "medium" || inv.riskLevel === "low")
  );

  // High-risk exposure: sum of outstanding where invoices_view marks row overdue
  // and risk_level = 'high'. Do not derive from overdue_days thresholds.
  const highRiskExposureNow = overdueInvoices
    .filter((inv) => inv.riskLevel === "high")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Calculate DSO (rolling 3 months)
  let dsoRolling3m: number | null = null;
  // Rolling 3 months is OK for DSO (time-window metric).
  const fullyPaidInvoices3m = ledgerInvoices.filter(
    (inv) =>
      inv.outstanding <= 0 &&
      inv.issueDate &&
      new Date(inv.issueDate) >= threeMonthsAgo
  );

  if (fullyPaidInvoices3m.length > 0) {
    const daysToPay: number[] = [];

    for (const inv of fullyPaidInvoices3m) {
      const issue = new Date(inv.issueDate!);
      const due = inv.dueDate ? new Date(inv.dueDate) : issue;
      const days = Math.max(
        Math.round((due.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)),
        0
      );
      daysToPay.push(days);
    }

    if (daysToPay.length > 0) {
      dsoRolling3m = Math.round(daysToPay.reduce((s, d) => s + d, 0) / daysToPay.length);
    }
  }

  const summary: DashboardSummary = {
    totalInvoiced12m,
    totalCollected12m,
    totalOutstandingNow,
    overdueAmountNow,
    highRiskExposureNow,
    dsoRolling3m,
  };

  // --- Calculate monthly series (last 12 months) ------------------------------
  const monthlyMap = new Map<string, { invoiced: number; collected: number; overdueAmount: number; overdueCount: number; highRiskAmount: number; outstanding: number }>();

  // Initialize last 12 months
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(monthKey, { invoiced: 0, collected: 0, overdueAmount: 0, overdueCount: 0, highRiskAmount: 0, outstanding: 0 });
  }

  // Aggregate invoices by issue_date month
  for (const inv of invoices12m) {
    if (!inv.issueDate) continue;
    const d = new Date(inv.issueDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.invoiced += inv.totalAmount;
    }
  }

  // Aggregate collected amounts from invoices_view.paid by issue_date month
  for (const inv of invoices12m) {
    if (!inv.issueDate) continue;
    const d = new Date(inv.issueDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.collected += inv.paidAmount;
    }
  }

  // Aggregate overdue by due_date month
  for (const inv of overdueInvoices) {
    if (!inv.dueDate) continue;
    const d = new Date(inv.dueDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.overdueAmount += inv.outstanding;
      existing.overdueCount += 1;
      if (inv.riskLevel === "high") {
        existing.highRiskAmount += inv.outstanding;
      }
    }
  }

  // Aggregate outstanding for each month (snapshot at month end would be complex, use current outstanding distributed)
  // For simplicity, we'll calculate outstanding trend from current outstanding and past invoices
  const monthlyEntries = Array.from(monthlyMap.entries()).sort();

  const invoicedMonthly = monthlyEntries.map(([month, data]) => ({
    month,
    amount: data.invoiced,
  }));

  const collectedMonthly = monthlyEntries.map(([month, data]) => ({
    month,
    amount: data.collected,
  }));

  const overdueMonthly = monthlyEntries.map(([month, data]) => ({
    month,
    amount: data.overdueAmount,
    count: data.overdueCount,
  }));

  // --- Calculate aging buckets ------------------------------------------------
  const agingBuckets: DashboardSeries["agingBuckets"] = [
    { bucket: "0-30", amount: 0 },
    { bucket: "31-60", amount: 0 },
    { bucket: "61-90", amount: 0 },
    { bucket: "90+", amount: 0 },
  ];

  for (const inv of overdueInvoices) {
    const d = inv.overdueDays;
    if (d <= 30) agingBuckets[0].amount += inv.outstanding;
    else if (d <= 60) agingBuckets[1].amount += inv.outstanding;
    else if (d <= 90) agingBuckets[2].amount += inv.outstanding;
    else agingBuckets[3].amount += inv.outstanding;
  }

  const series: DashboardSeries = {
    invoicedMonthly,
    collectedMonthly,
    overdueMonthly,
    agingBuckets,
  };

  // --- Risk overview ----------------------------------------------------------
  // AR focus uses overdue/risk summaries across overdue ledger invoices.
  const arRiskInvoices = overdueInvoices.filter(
    (inv) => inv.riskLevel === "high" || inv.riskLevel === "medium" || inv.riskLevel === "low"
  );
  const riskOverview: RiskOverview = computeRiskBuckets(arRiskInvoices, { mode: "ledger" });

  // --- Upcoming due (next 14 days) -------------------------------------------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Collections exposure: upcoming invoices that are eligible for reminders/chase UI.
  // Aligns with Reminders eligibility: active, non-archived clients + outstanding > 0 + sent/partially_paid.
  const upcomingDue: UpcomingDueItem[] = ledgerInvoices
    .filter(
      (inv) =>
        inv.outstanding > 0 &&
        (inv.status === "sent" || inv.status === "partially_paid") &&
        inv.clientId != null &&
        inv.clientIsActive &&
        inv.clientArchivedAt == null &&
        inv.dueDate &&
        new Date(inv.dueDate) >= today &&
        new Date(inv.dueDate) <= fourteenDaysFromNow
    )
    .sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    })
    .slice(0, 10)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      dueDate: inv.dueDate!,
      totalAmount: inv.totalAmount,
      outstanding: inv.outstanding,
      status: inv.status as "sent" | "partially_paid" | "draft",
    }));

  // --- Recent activity --------------------------------------------------------
  const recentActivity: ActivityItem[] = [];

  // Add recent invoices (using issue_date as created_at proxy)
  for (const inv of ledgerInvoices) {
    if (!inv.issueDate) continue;
    const statusLabel =
      inv.status === "paid"
        ? "Paid"
        : inv.status === "overdue"
        ? "Overdue"
        : inv.status === "sent"
        ? "Sent"
        : inv.status === "partially_paid"
        ? "Partially Paid"
        : inv.status === "void"
        ? "Void"
        : "Draft";

    recentActivity.push({
      id: inv.id,
      type: "invoice",
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      date: inv.issueDate,
      amount: inv.totalAmount,
      statusLabel,
    });
  }

  // Sort by date descending (created_at desc) and cap to 20
  recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivityCapped = recentActivity.slice(0, 20);

  // --- AR Focus Data ----------------------------------------------------------
  // AR focus is overdue + risk summary data (separate from collections-action eligibility).
  const arOverdueInvoices = overdueInvoices;
  const arCollectibleOutstanding = arOverdueInvoices.reduce(
    (sum, inv) => sum + inv.outstanding,
    0
  );
  const arOverdueAmount = arCollectibleOutstanding;
  const arHighRiskExposure = arOverdueInvoices
    .filter((inv) => inv.riskLevel === "high")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // High-risk = overdue outstanding by client for AR summaries.
  const clientOverdueMap = new Map<
    string,
    { clientId: string; clientName: string; overdueAmount: number; maxOverdueDays: number }
  >();

  for (const inv of arOverdueInvoices) {
    if (!inv.clientId || !inv.clientName) continue;

    const existing = clientOverdueMap.get(inv.clientId);
    const days = inv.overdueDays ?? 0;
    if (existing) {
      existing.overdueAmount += inv.outstanding;
      existing.maxOverdueDays = Math.max(existing.maxOverdueDays, days);
    } else {
      clientOverdueMap.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        overdueAmount: inv.outstanding,
        maxOverdueDays: days,
      });
    }
  }

  const allTopOverdueClients = Array.from(clientOverdueMap.values())
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .map(({ clientName, overdueAmount }) => ({ clientName, overdueAmount }));
  const topOverdueClientsHasMore = allTopOverdueClients.length > 10;
  const topOverdueClients = allTopOverdueClients.slice(0, 10);

  const allOverdueInvoicesList: CollectionsWorkItem[] = [...arOverdueInvoices]
    .sort((a, b) => b.outstanding - a.outstanding)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      dueDate: inv.dueDate ?? "",
      overdueDays: inv.overdueDays,
      outstanding: inv.outstanding,
      riskLevel: inv.riskLevel,
      primaryEmail: inv.clientId ? eligibleClients.get(inv.clientId)?.email ?? null : null,
    }));
  const overdueInvoicesHasMore = allOverdueInvoicesList.length > 10;
  const overdueInvoicesList = allOverdueInvoicesList.slice(0, 10);

  const arFocus: ArFocusData = {
    collectibleOutstanding: arCollectibleOutstanding,
    overdueAmount: arOverdueAmount,
    highRiskExposure: arHighRiskExposure,
    overdueInvoicesCount: arOverdueInvoices.length,
    topOverdueClients,
    topOverdueClientsHasMore,
    overdueInvoices: overdueInvoicesList,
    overdueInvoicesHasMore,
  };

  // --- Owner Overview Data ----------------------------------------------------
  const invoicesLast30 = ledgerInvoices.filter((inv) => {
    if (!inv.issueDate) return false;
    const issueDate = new Date(inv.issueDate);
    return issueDate >= thirtyDaysAgo;
  });

  const totalInvoiced30 = invoicesLast30.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalCollected30 = invoicesLast30.reduce((sum, inv) => sum + inv.paidAmount, 0);

  const collectionRate = totalInvoiced30 > 0 ? totalCollected30 / totalInvoiced30 : null;

  // Status funnel
  const funnelMap = new Map<string, { amount: number; count: number }>();

  for (const inv of ledgerInvoices) {
    let status: "paid" | "overdue" | "sent" | "draft";
    if (inv.status === "paid") {
      status = "paid";
    } else if (inv.status === "overdue") {
      status = "overdue";
    } else if (inv.status === "sent") {
      status = "sent";
    } else {
      status = "draft";
    }

    const existing = funnelMap.get(status);
    if (existing) {
      existing.count += 1;
      existing.amount += inv.totalAmount;
    } else {
      funnelMap.set(status, { count: 1, amount: inv.totalAmount });
    }
  }

  const funnel = Array.from(funnelMap.entries()).map(([status, data]) => ({
    status: status as "paid" | "overdue" | "sent" | "draft",
    amount: data.amount,
    count: data.count,
  }));

  // Best clients
  const clientPaymentsMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      totalCollected: number;
      invoiceIds: Set<string>;
    }
  >();

  for (const inv of safeInvoices) {
    if (!inv.clientId || !inv.clientName) continue;

    const collectedForInvoice = inv.paidAmount;
    const existing = clientPaymentsMap.get(inv.clientId);
    if (existing) {
      existing.totalCollected += collectedForInvoice;
      existing.invoiceIds.add(inv.id);
    } else {
      clientPaymentsMap.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        totalCollected: collectedForInvoice,
        invoiceIds: new Set([inv.id]),
      });
    }
  }

  const allBestClients = Array.from(clientPaymentsMap.values())
    .map((client) => {
      // Calculate avgDays: average days between invoice issue date and payment date per client
      let avgDays: number | null = null;
      const paymentDays: number[] = [];
      
      for (const inv of safeInvoices) {
        if (inv.clientId !== client.clientId || !inv.issueDate || !inv.dueDate) continue;
        if (inv.paidAmount <= 0) continue;

        const issueDate = new Date(inv.issueDate);
        const dueDate = new Date(inv.dueDate);
        const daysDiff = Math.max(
          Math.round((dueDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)),
          0
        );
        paymentDays.push(daysDiff);
      }
      
      if (paymentDays.length > 0) {
        avgDays = Math.round(paymentDays.reduce((s, d) => s + d, 0) / paymentDays.length);
      }

      return {
        clientName: client.clientName,
        collected: client.totalCollected,
        avgDays,
        invoices: client.invoiceIds.size,
      };
    })
    .sort((a, b) => b.collected - a.collected);
  const bestClientsHasMore = allBestClients.length > 10;
  const bestClients = allBestClients.slice(0, 10);

  // Problem clients (At-Risk Clients)
  const problemClientsMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      overdueInvoices: Array<{ overdueDays: number; invoiceId: string }>;
      totalOutstanding: number;
      invoiceIds: Set<string>;
    }
  >();

  for (const inv of overdueInvoices) {
    if (!inv.clientId || !inv.clientName) continue;

    const existing = problemClientsMap.get(inv.clientId);
    if (existing) {
      existing.overdueInvoices.push({ overdueDays: inv.overdueDays, invoiceId: inv.id });
      existing.totalOutstanding += inv.outstanding;
      existing.invoiceIds.add(inv.id);
    } else {
      problemClientsMap.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        overdueInvoices: [{ overdueDays: inv.overdueDays, invoiceId: inv.id }],
        totalOutstanding: inv.outstanding,
        invoiceIds: new Set([inv.id]),
      });
    }
  }

  const allProblemClients = Array.from(problemClientsMap.values())
    .map((client) => {
      const avgDaysOverdue =
        client.overdueInvoices.length > 0
          ? Math.round(
              client.overdueInvoices.reduce((s, inv) => s + inv.overdueDays, 0) /
                client.overdueInvoices.length
            )
          : 0;

      // Count distinct invoice IDs for this client
      const invoiceCount = client.invoiceIds.size;
      
      return {
        clientName: client.clientName,
        avgDaysOverdue,
        outstanding: client.totalOutstanding,
        invoiceCount,
      };
    })
    .sort((a, b) => b.avgDaysOverdue - a.avgDaysOverdue);
  const problemClientsHasMore = allProblemClients.length > 10;
  const problemClients = allProblemClients.slice(0, 10);

  const ownerOverview: OwnerOverviewData = {
    last30: {
      totalInvoiced: totalInvoiced30,
      totalCollected: totalCollected30,
      collectionRate,
      dso: dsoRolling3m,
    },
    funnel,
    bestClients,
    bestClientsHasMore,
    problemClients,
    problemClientsHasMore,
  };

  // --- Collections Mode Data --------------------------------------------------
  const allCollectionsWorklist: CollectionsWorkItem[] = collectionsExposureInvoices
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      dueDate: inv.dueDate ?? "",
      overdueDays: inv.overdueDays,
      outstanding: inv.outstanding,
      riskLevel: inv.riskLevel,
      primaryEmail: inv.clientId ? eligibleClients.get(inv.clientId)?.email ?? null : null,
    }))
    .sort((a, b) => {
      // Sort by risk (high first), then by outstanding desc
      const riskOrder = { high: 0, medium: 1, low: 2, null: 3 };
      const aRisk = riskOrder[a.riskLevel ?? ("null" as keyof typeof riskOrder)];
      const bRisk = riskOrder[b.riskLevel ?? ("null" as keyof typeof riskOrder)];
      if (aRisk !== bRisk) return aRisk - bRisk;
      return b.outstanding - a.outstanding;
    });
  // NOTE: Do NOT slice here. CollectionsModeView supports client-side filtering by risk,
  // so it needs the full (sorted) worklist to avoid “low risk” disappearing when it falls
  // outside the top 10 of the combined list.
  const collectionsWorklistHasMore = allCollectionsWorklist.length > 10;
  const collectionsWorklist = allCollectionsWorklist;

  const collectionsMode: CollectionsModeData = {
    invoicesInView: allCollectionsWorklist.length,
    outstandingInView: allCollectionsWorklist.reduce((sum, item) => sum + item.outstanding, 0),
    worklist: collectionsWorklist,
    worklistHasMore: collectionsWorklistHasMore,
    totalCount: allCollectionsWorklist.length,
  };

  // --- Calculate Reminder Effectiveness (last 12 months) --------------------
  let reminderEffectiveness: ReminderEffectivenessData[] = [];

  try {
    const { data: remindersRaw, error: remindersError } = await supabase
      .from("reminders")
      .select("sent_at, workspace_id")
      .eq("workspace_id", workspaceId)
      .not("sent_at", "is", null)
      .gte("sent_at", twelveMonthsAgo.toISOString());

    if (remindersError) {
      console.error("[Dashboard] reminders error", remindersError);
    } else {
      // Initialize monthly map for last 12 months
      const reminderMonthlyMap = new Map<string, number>();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        reminderMonthlyMap.set(monthKey, 0);
      }

      // Count reminders by sent_at month
      if (remindersRaw) {
        for (const reminder of remindersRaw) {
          if (!reminder.sent_at) continue;
          const sentDate = new Date(reminder.sent_at);
          const monthKey = `${sentDate.getFullYear()}-${String(sentDate.getMonth() + 1).padStart(2, "0")}`;
          const existing = reminderMonthlyMap.get(monthKey);
          if (existing !== undefined) {
            reminderMonthlyMap.set(monthKey, existing + 1);
          }
        }
      }

      // Combine with payments data (already loaded) to create effectiveness chart
      reminderEffectiveness = Array.from(reminderMonthlyMap.entries())
        .sort()
        .map(([month, remindersCount]) => {
          const paymentForMonth = series.collectedMonthly.find((p) => p.month === month);
          return {
            month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
            remindersSent: remindersCount,
            paymentsReceived: paymentForMonth?.amount ?? 0,
          };
        });
    }
  } catch (error) {
    console.error("[Dashboard] reminder effectiveness calculation failed", error);
    reminderEffectiveness = [];
  }

  return {
    summary,
    series,
    riskOverview,
    upcomingDue,
    recentActivity: recentActivityCapped,
    recentActivityHasMore: false,
    arFocus,
    ownerOverview,
    collectionsMode,
    insight,
    reminderEffectiveness,
  };
}

export async function getDashboardSummary(workspaceId: string): Promise<DashboardSummaryPremium> {
  const supabase = await supabaseServer();

  // getDashboardSummary powers the top “Premium KPI Row”:
  // - Total Invoiced / Collected / Outstanding cards
  // - Overdue Amount + High-Risk Exposure tiles
  // It should use all-time ledger totals from invoices_view (no date filter) for these core KPIs.

  const toNumber = (value: number | string | null): number => {
    if (value == null) return 0;
    if (typeof value === "number") return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("default_currency")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const defaultCurrency = (settingsRow as { default_currency?: string } | null)?.default_currency || "USD";

  const now = new Date();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const previousTwelveMonthsAgo = new Date();
  previousTwelveMonthsAgo.setMonth(previousTwelveMonthsAgo.getMonth() - 24);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // --- Load invoices_view ----------------------------------------------------
  let invoicesRaw: Array<{
    id: string;
    total: number | string | null;
    paid: number | string | null;
    outstanding: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    display_status: string | null;
    base_status: string | null;
    is_overdue: boolean | null;
    risk_level: string | null;
    client_is_active?: boolean | null;
    client_archived_at?: string | null;
    currency: string | null;
    archived_at: string | null;
  }> = [];

  try {
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices_view")
      .select(
        "id, total, paid, outstanding, issue_date, due_date, display_status, base_status, is_overdue, risk_level, client_is_active, client_archived_at, currency, archived_at"
      )
      .eq("workspace_id", workspaceId)
      // invoices_view excludes archived invoices at SQL, but keep explicit for consistency.
      .is("archived_at", null)
      // Exclude draft/void from ledger totals + risk exposure.
      .not("base_status", "in", '("draft","void")');

    if (invoicesError) {
      console.error("[Dashboard] invoices_view error in getDashboardSummary", invoicesError);
      invoicesRaw = [];
    } else {
      invoicesRaw = invoices ?? [];
    }
  } catch (error) {
    console.error("[Dashboard] failed to load invoices in getDashboardSummary", error);
    invoicesRaw = [];
  }

  const safeInvoices = invoicesRaw.map((inv) => ({
    id: inv.id,
    totalAmount: toNumber(inv.total),
    paidAmount: toNumber(inv.paid),
    outstanding: toNumber(inv.outstanding),
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    status: inv.display_status ?? "draft",
    baseStatus: inv.base_status ?? null,
    isOverdue: Boolean(inv.is_overdue),
    riskLevel: inv.risk_level as "high" | "medium" | "low" | null,
    clientIsActive: Boolean(inv.client_is_active),
    clientArchivedAt: inv.client_archived_at ?? null,
  }));

  // Ledger AR view: all-time invoices_view totals,
  // excluding draft/void and archived invoices. No date filter.
  const totalInvoicedAllTime = safeInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalCollectedAllTime = safeInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalOutstandingNow = safeInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);

  // Overdue amount: sum of outstanding for all overdue, non-archived, non-draft/non-void invoices_view rows.
  const overdueAmountNow = safeInvoices
    .filter((inv) => inv.isOverdue && inv.outstanding > 0)
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // High-risk exposure: overdue rows with risk_level = 'high' from invoices_view.
  // Do not mix this metric with overdue_days thresholds.
  const highRiskExposureNow = safeInvoices
    .filter((inv) => inv.isOverdue && inv.outstanding > 0 && inv.riskLevel === "high")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Payments last 30 days are derived from invoices_view.paid for invoices issued in this window.
  // This keeps financial rollups sourced from invoices_view only.
  const invoicesLast30 = safeInvoices.filter(
    (inv) => inv.issueDate && new Date(inv.issueDate) >= thirtyDaysAgo
  );
  const paymentsLast30Days = invoicesLast30.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const paymentsLast30DaysCount = invoicesLast30.filter((inv) => inv.paidAmount > 0).length;

  // Calculate totals for current 12 months
  const invoices12m = safeInvoices.filter(
    (inv) => inv.issueDate && new Date(inv.issueDate) >= twelveMonthsAgo
  );
  const totalInvoiced12m = invoices12m.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Paid total for the KPI period (12 months): sourced from invoices_view.paid.
  // Rolling window is OK here: this is a trend/delta metric, not the all-time ledger total above.
  const totalCollected12m = safeInvoices
    .filter((inv) => inv.issueDate && new Date(inv.issueDate) >= twelveMonthsAgo)
    .reduce((sum, inv) => sum + inv.paidAmount, 0);

  // Calculate DSO (rolling 3 months)
  let dsoRolling3m = 0;
  const fullyPaid3m = safeInvoices.filter(
    (inv) => inv.outstanding <= 0 && inv.issueDate && new Date(inv.issueDate) >= threeMonthsAgo
  );

  if (fullyPaid3m.length > 0) {
    const daysToPay: number[] = [];
    for (const inv of fullyPaid3m) {
      const issue = new Date(inv.issueDate!);
      const due = inv.dueDate ? new Date(inv.dueDate) : issue;
      const days = Math.max(
        Math.round((due.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)),
        0
      );
      daysToPay.push(days);
    }
    if (daysToPay.length > 0) {
      dsoRolling3m = Math.round(daysToPay.reduce((s, d) => s + d, 0) / daysToPay.length);
    }
  }

  // Calculate totals for previous 12 months (for deltas)
  const invoicesPrev12m = safeInvoices.filter(
    (inv) =>
      inv.issueDate &&
      new Date(inv.issueDate) >= previousTwelveMonthsAgo &&
      new Date(inv.issueDate) < twelveMonthsAgo
  );
  const totalInvoicedPrev12m = invoicesPrev12m.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalCollectedPrev12m = safeInvoices
    .filter(
      (inv) =>
        inv.issueDate &&
        new Date(inv.issueDate) >= previousTwelveMonthsAgo &&
        new Date(inv.issueDate) < twelveMonthsAgo
    )
    .reduce((sum, inv) => sum + inv.paidAmount, 0);

  // Calculate deltas
  const invoicedPct = totalInvoicedPrev12m > 0
    ? ((totalInvoiced12m - totalInvoicedPrev12m) / totalInvoicedPrev12m) * 100
    : 0;
  const collectedPct = totalCollectedPrev12m > 0
    ? ((totalCollected12m - totalCollectedPrev12m) / totalCollectedPrev12m) * 100
    : 0;

  // For outstanding/overdue/highRisk, compare to previous period (30 days ago snapshot)
  // Simplified: use current values (real implementation would track historical snapshots)
  const outstandingPct = 0; // Would need historical snapshot
  const overduePct = 0;
  const highRiskPct = 0;
  const dsoPct = 0;

  // Build monthly trends (12 months) - calculate for each month
  const monthlyTrends: {
    invoiced: number[];
    collected: number[];
    overdue: number[];
    highRisk: number[];
    outstanding: number[];
    dso: number[];
  } = {
    invoiced: [],
    collected: [],
    overdue: [],
    highRisk: [],
    outstanding: [],
    dso: [],
  };

  // IMPORTANT: invoices_view is the source of truth for overdue/risk (no due_date/status recompute).
  const overdueByDueMonth = new Map<string, { overdue: number; highRisk: number }>();
  for (const inv of safeInvoices) {
    if (!inv.isOverdue || inv.outstanding <= 0 || !inv.dueDate) continue;
    const d = new Date(inv.dueDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = overdueByDueMonth.get(monthKey) ?? { overdue: 0, highRisk: 0 };
    existing.overdue += inv.outstanding;
    if (inv.riskLevel === "high") {
      existing.highRisk += inv.outstanding;
    }
    overdueByDueMonth.set(monthKey, existing);
  }

  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    // Invoiced for this month
    const monthInvoices = safeInvoices.filter((inv) => {
      if (!inv.issueDate) return false;
      const date = new Date(inv.issueDate);
      return date >= monthStart && date <= monthEnd;
    });
    monthlyTrends.invoiced.push(
      monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
    );

    // Collected for this month (KPI trend): invoices_view.paid on invoices issued in this month.
    const monthInvoicesForPaid = safeInvoices.filter((inv) => {
      if (!inv.issueDate) return false;
      const date = new Date(inv.issueDate);
      return date >= monthStart && date <= monthEnd;
    });
    monthlyTrends.collected.push(
      monthInvoicesForPaid.reduce((sum, inv) => sum + inv.paidAmount, 0)
    );

    // Overdue/high-risk trend (ledger): group current overdue invoices by due_date month.
    const dueMonthKey = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}`;
    const overdueAgg = overdueByDueMonth.get(dueMonthKey) ?? { overdue: 0, highRisk: 0 };
    monthlyTrends.overdue.push(overdueAgg.overdue);
    monthlyTrends.highRisk.push(overdueAgg.highRisk);

    // Outstanding at end of this month (simplified: current outstanding for all invoices issued up to month end)
    const outstandingAtMonthEnd = safeInvoices.filter((inv) => {
      if (!inv.issueDate) return false;
      const issueDate = new Date(inv.issueDate);
      return issueDate <= monthEnd;
    });
    monthlyTrends.outstanding.push(
      outstandingAtMonthEnd.reduce((sum, inv) => sum + inv.outstanding, 0)
    );

    // DSO for this month (simplified: use rolling 3m value for recent months)
    monthlyTrends.dso.push(i >= 9 ? (dsoRolling3m || 0) : 0);
  }

  return {
    defaultCurrency,
    totals: {
      totalInvoiced: totalInvoicedAllTime,
      totalCollected: totalCollectedAllTime,
      totalOutstanding: totalOutstandingNow,
      overdueAmount: overdueAmountNow,
      highRiskExposure: highRiskExposureNow,
      dso: dsoRolling3m,
      paymentsLast30Days,
      paymentsLast30DaysCount,
    },
    trends: monthlyTrends,
    deltas: {
      invoicedPct,
      collectedPct,
      outstandingPct,
      overduePct,
      highRiskPct,
      dsoPct,
    },
    periods: {
      invoicedLabel: "All time",
      collectedLabel: "All time",
      outstandingLabel: "Open balance",
      overdueLabel: "Overdue",
      highRiskLabel: "High-risk overdue",
      dsoLabel: "Rolling 3 months",
    },
  };
}
