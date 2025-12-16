/**
 * Server-side dashboard data loader - Dashboard v3
 */

import { supabaseServer } from "@/lib/supabase/server";
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
  InsightSeverity,
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

// Helper functions
function calcDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  return ((current - previous) / previous) * 100;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
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
  workspaceId: string,
  collectionsLimit: number = 10,
  collectionsOffset: number = 0
): Promise<DashboardData> {
  const supabase = await supabaseServer();

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
  let invoicesRaw: Array<{
    id: string;
    client_id: string | null;
    client_name: string | null;
    invoice_number: string | null;
    display_status: string | null;
    base_status: string | null;
    issue_date: string | null;
    due_date: string | null;
    total: number | string | null;
    paid: number | string | null;
    outstanding: number | string | null;
    currency: string | null;
    overdue_days: number | null;
    risk_level: string | null;
  }> = [];

  try {
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices_view")
      .select(
        "id, workspace_id, client_id, client_name, invoice_number, display_status, base_status, issue_date, due_date, currency, total, paid, outstanding, overdue_days, risk_level"
      )
      .eq("workspace_id", workspaceId);

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
    status: inv.display_status ?? "draft",
    baseStatus: inv.base_status ?? null,
    issueDate: inv.issue_date ?? null,
    dueDate: inv.due_date ?? null,
    totalAmount: toNumber(inv.total),
    paidAmount: toNumber(inv.paid),
    outstanding: toNumber(inv.outstanding),
    overdueDays: Number(inv.overdue_days ?? 0),
    riskLevel: (inv.risk_level as "high" | "medium" | "low" | null) ?? null,
  }));

  // --- Load payments ----------------------------------------------------------
  let paymentsRaw: Array<{
    id: string;
    amount: number | string | null;
    payment_date: string | null;
    invoice_id: string | null;
  }> = [];

  try {
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("id, workspace_id, amount, payment_date, invoice_id")
      .eq("workspace_id", workspaceId)
      .gte("payment_date", twelveMonthsAgo.toISOString().slice(0, 10));

    if (paymentsError) {
      console.error("[Dashboard] payments error", {
        message: paymentsError.message,
        details: paymentsError.details,
        hint: paymentsError.hint,
        code: paymentsError.code,
      });
      paymentsRaw = [];
    } else {
      paymentsRaw = payments ?? [];
    }
  } catch (error) {
    console.error("[Dashboard] payments query failed", error);
    paymentsRaw = [];
  }

  const safePayments = paymentsRaw.map((p) => ({
    amount: toNumber(p.amount),
    paymentDate: p.payment_date ? new Date(p.payment_date) : null,
    invoiceId: p.invoice_id ?? null,
  }));

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

    // Collected amount from payments with paid date in [start, end]
    const collectedAmount = safePayments
      .filter((p) => {
        if (!p.paymentDate) return false;
        return p.paymentDate >= start && p.paymentDate <= end;
      })
      .reduce((sum, p) => sum + p.amount, 0);

    // Overdue as of end date: invoices with due_date < end AND non-final status
    const overdueAtEnd = safeInvoices.filter((inv) => {
      if (!inv.dueDate) return false;
      const dueDate = new Date(inv.dueDate);
      if (dueDate >= end) return false;
      // Non-final status means not paid and not void
      return inv.status !== "paid" && inv.status !== "void";
    });

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

  // Default currency - could be extended to read from workspace settings
  const currency = "USD";

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
        message: `${current.overdueCount} overdue invoice${current.overdueCount !== 1 ? "s" : ""} totaling ${formatCurrency(current.overdueAmount, currencyCode)}. Up ${formatPercent(overdueDelta!)} from last period.`,
        severity: "warning",
        primaryMetricLabel: "Overdue Amount",
        primaryMetricValue: formatCurrency(current.overdueAmount, currencyCode),
        deltaLabel: "Change",
        deltaValue: formatPercent(overdueDelta!),
      };
    }

    // Priority 2: High-risk invoices
    if (current.highRiskAmount > 0) {
      const deltaText = highRiskDelta !== null ? ` (${highRiskDelta > 0 ? "+" : ""}${formatPercent(highRiskDelta!)})` : "";
      return {
        title: "High-risk invoices need attention",
        message: `${current.highRiskCount} high-risk invoice${current.highRiskCount !== 1 ? "s" : ""} with ${formatCurrency(current.highRiskAmount, currencyCode)} exposure${deltaText}.`,
        severity: "warning",
        primaryMetricLabel: "High-Risk Exposure",
        primaryMetricValue: formatCurrency(current.highRiskAmount, currencyCode),
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
      message: `Invoiced ${formatCurrency(current.invoicedAmount, currencyCode)}, collected ${formatCurrency(current.collectedAmount, currencyCode)}. ${current.overdueAmount > 0 ? `${formatCurrency(current.overdueAmount, currencyCode)} overdue.` : "No overdue invoices."}`,
      severity: "neutral",
      primaryMetricLabel: "Collected",
      primaryMetricValue: formatCurrency(current.collectedAmount, currencyCode),
    };
  }

  const insight = buildDashboardInsight(currentStats, previousStats, currency);

  // --- Calculate summary ------------------------------------------------------
  const invoices12m = safeInvoices.filter(
    (inv) => inv.issueDate && new Date(inv.issueDate) >= twelveMonthsAgo
  );
  const totalInvoiced12m = invoices12m.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const payments12m = safePayments.filter(
    (p) => p.paymentDate && p.paymentDate >= twelveMonthsAgo
  );
  const totalCollected12m = payments12m.reduce((sum, p) => sum + p.amount, 0);

  const totalOutstandingNow = safeInvoices.reduce(
    (sum, inv) => sum + (inv.status === "void" ? 0 : inv.outstanding),
    0
  );

  const overdueInvoices = safeInvoices.filter((inv) => inv.status === "overdue");
  const overdueAmountNow = overdueInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);

  const highRiskExposureNow = overdueInvoices
    .filter((inv) => inv.riskLevel === "high")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Calculate DSO (rolling 3 months)
  let dsoRolling3m: number | null = null;
  const fullyPaidInvoices3m = safeInvoices.filter(
    (inv) =>
      inv.outstanding <= 0 &&
      inv.issueDate &&
      new Date(inv.issueDate) >= threeMonthsAgo
  );

  if (fullyPaidInvoices3m.length > 0 && safePayments.length > 0) {
    const daysToPay: number[] = [];

    for (const inv of fullyPaidInvoices3m) {
      const issue = new Date(inv.issueDate!);
      const relevantPayments = safePayments.filter(
        (p) => p.paymentDate && p.paymentDate >= threeMonthsAgo && p.invoiceId === inv.id
      );

      if (relevantPayments.length === 0) continue;

      const lastPayment = relevantPayments
        .map((p) => p.paymentDate!.getTime())
        .sort((a, b) => b - a)[0];

      const days = Math.max(
        Math.round((lastPayment - issue.getTime()) / (1000 * 60 * 60 * 24)),
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

  // Aggregate payments by payment_date month
  for (const p of payments12m) {
    if (!p.paymentDate) continue;
    const d = p.paymentDate;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.collected += p.amount;
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
  const riskOverview: RiskOverview = {
    high: {
      invoiceCount: overdueInvoices.filter((inv) => inv.riskLevel === "high").length,
      amount: overdueInvoices
        .filter((inv) => inv.riskLevel === "high")
        .reduce((sum, inv) => sum + inv.outstanding, 0),
    },
    medium: {
      invoiceCount: overdueInvoices.filter((inv) => inv.riskLevel === "medium").length,
      amount: overdueInvoices
        .filter((inv) => inv.riskLevel === "medium")
        .reduce((sum, inv) => sum + inv.outstanding, 0),
    },
    low: {
      invoiceCount: overdueInvoices.filter((inv) => inv.riskLevel === "low").length,
      amount: overdueInvoices
        .filter((inv) => inv.riskLevel === "low")
        .reduce((sum, inv) => sum + inv.outstanding, 0),
    },
  };

  // --- Upcoming due (next 14 days) -------------------------------------------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingDue: UpcomingDueItem[] = safeInvoices
    .filter(
      (inv) =>
        (inv.status === "sent" ||
          inv.status === "partially_paid" ||
          inv.status === "draft") &&
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
  for (const inv of safeInvoices) {
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

  // Add recent payments
  for (const p of safePayments) {
    if (!p.paymentDate || !p.invoiceId) continue;
    const inv = safeInvoices.find((i) => i.id === p.invoiceId);
    if (!inv) continue;

    recentActivity.push({
      id: `payment-${p.invoiceId}-${p.paymentDate.getTime()}`,
      type: "payment",
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      date: p.paymentDate.toISOString().slice(0, 10),
      amount: p.amount,
      statusLabel: "Paid",
    });
  }

  // Sort by date descending (created_at desc) and cap to 20
  recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivityCapped = recentActivity.slice(0, 20);

  // --- AR Focus Data ----------------------------------------------------------
  const clientOverdueMap = new Map<string, { clientName: string; overdueAmount: number }>();

  for (const inv of overdueInvoices) {
    if (!inv.clientId || !inv.clientName) continue;

    const existing = clientOverdueMap.get(inv.clientId);
    if (existing) {
      existing.overdueAmount += inv.outstanding;
    } else {
      clientOverdueMap.set(inv.clientId, {
        clientName: inv.clientName,
        overdueAmount: inv.outstanding,
      });
    }
  }

  const allTopOverdueClients = Array.from(clientOverdueMap.values())
    .sort((a, b) => b.overdueAmount - a.overdueAmount);
  const topOverdueClientsHasMore = allTopOverdueClients.length > 10;
  const topOverdueClients = allTopOverdueClients.slice(0, 10);

  const allOverdueInvoicesList: CollectionsWorkItem[] = overdueInvoices
    .sort((a, b) => b.outstanding - a.outstanding)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      dueDate: inv.dueDate ?? "",
      overdueDays: inv.overdueDays,
      outstanding: inv.outstanding,
      riskLevel: inv.riskLevel,
    }));
  const overdueInvoicesHasMore = allOverdueInvoicesList.length > 10;
  const overdueInvoicesList = allOverdueInvoicesList.slice(0, 10);

  const arFocus: ArFocusData = {
    topOverdueClients,
    topOverdueClientsHasMore,
    overdueInvoices: overdueInvoicesList,
    overdueInvoicesHasMore,
  };

  // --- Owner Overview Data ----------------------------------------------------
  const invoicesLast30 = safeInvoices.filter((inv) => {
    if (!inv.issueDate) return false;
    const issueDate = new Date(inv.issueDate);
    return issueDate >= thirtyDaysAgo;
  });

  const totalInvoiced30 = invoicesLast30.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const paymentsLast30 = safePayments.filter((p) => {
    if (!p.paymentDate) return false;
    return p.paymentDate >= thirtyDaysAgo;
  });

  const totalCollected30 = paymentsLast30.reduce((sum, p) => sum + p.amount, 0);

  const collectionRate = totalInvoiced30 > 0 ? totalCollected30 / totalInvoiced30 : null;

  // Status funnel
  const funnelMap = new Map<string, { amount: number; count: number }>();

  for (const inv of safeInvoices) {
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

  for (const p of safePayments) {
    if (!p.invoiceId) continue;
    const inv = safeInvoices.find((i) => i.id === p.invoiceId);
    if (!inv || !inv.clientId || !inv.clientName) continue;

    const existing = clientPaymentsMap.get(inv.clientId);
    if (existing) {
      existing.totalCollected += p.amount;
      existing.invoiceIds.add(inv.id);
    } else {
      clientPaymentsMap.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        totalCollected: p.amount,
        invoiceIds: new Set([inv.id]),
      });
    }
  }

  const allBestClients = Array.from(clientPaymentsMap.values())
    .map((client) => {
      // Calculate avgDays: average days between invoice issue date and payment date per client
      let avgDays: number | null = null;
      const paymentDays: number[] = [];
      
      for (const p of safePayments) {
        if (!p.invoiceId || !p.paymentDate) continue;
        const inv = safeInvoices.find((i) => i.id === p.invoiceId);
        if (!inv || inv.clientId !== client.clientId || !inv.issueDate) continue;
        
        const issueDate = new Date(inv.issueDate);
        const paymentDate = new Date(p.paymentDate);
        const daysDiff = Math.max(
          Math.round((paymentDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)),
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
  const allCollectionsWorklist: CollectionsWorkItem[] = overdueInvoices
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName ?? "—",
      dueDate: inv.dueDate ?? "",
      overdueDays: inv.overdueDays,
      outstanding: inv.outstanding,
      riskLevel: inv.riskLevel,
    }))
    .sort((a, b) => {
      // Sort by risk (high first), then by outstanding desc
      const riskOrder = { high: 0, medium: 1, low: 2, null: 3 };
      const aRisk = riskOrder[a.riskLevel ?? ("null" as keyof typeof riskOrder)];
      const bRisk = riskOrder[b.riskLevel ?? ("null" as keyof typeof riskOrder)];
      if (aRisk !== bRisk) return aRisk - bRisk;
      return b.outstanding - a.outstanding;
    });
  const collectionsWorklistHasMore = allCollectionsWorklist.length > 10;
  const collectionsWorklist = allCollectionsWorklist.slice(0, 10);

  const collectionsMode: CollectionsModeData = {
    invoicesInView: allCollectionsWorklist.length,
    outstandingInView: allCollectionsWorklist.reduce((sum, item) => sum + item.outstanding, 0),
    worklist: collectionsWorklist,
    worklistHasMore: collectionsWorklistHasMore,
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
        .map(([month, remindersCount], idx) => {
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

  const toNumber = (value: number | string | null): number => {
    if (value == null) return 0;
    if (typeof value === "number") return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const now = new Date();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const previousTwelveMonthsAgo = new Date();
  previousTwelveMonthsAgo.setMonth(previousTwelveMonthsAgo.getMonth() - 24);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // --- Load invoices_view ----------------------------------------------------
  let invoicesRaw: Array<{
    total: number | string | null;
    paid: number | string | null;
    outstanding: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    display_status: string | null;
    risk_level: string | null;
    currency: string | null;
  }> = [];

  try {
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices_view")
      .select("total, paid, outstanding, issue_date, due_date, display_status, risk_level, currency")
      .eq("workspace_id", workspaceId);

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
    totalAmount: toNumber(inv.total),
    paidAmount: toNumber(inv.paid),
    outstanding: toNumber(inv.outstanding),
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    status: inv.display_status ?? "draft",
    riskLevel: inv.risk_level as "high" | "medium" | "low" | null,
  }));

  // --- Load payments ----------------------------------------------------------
  let paymentsRaw: Array<{
    amount: number | string | null;
    payment_date: string | null;
    invoice_id: string | null;
  }> = [];

  try {
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount, payment_date, invoice_id")
      .eq("workspace_id", workspaceId)
      .gte("payment_date", previousTwelveMonthsAgo.toISOString().slice(0, 10));

    if (paymentsError) {
      console.error("[Dashboard] payments error in getDashboardSummary", paymentsError);
      paymentsRaw = [];
    } else {
      paymentsRaw = payments ?? [];
    }
  } catch (error) {
    console.error("[Dashboard] payments query failed in getDashboardSummary", error);
    paymentsRaw = [];
  }

  const safePayments = paymentsRaw.map((p) => ({
    amount: toNumber(p.amount),
    paymentDate: p.payment_date ? new Date(p.payment_date) : null,
    invoiceId: p.invoice_id ?? null,
  }));

  // Calculate totals for current 12 months
  const invoices12m = safeInvoices.filter(
    (inv) => inv.issueDate && new Date(inv.issueDate) >= twelveMonthsAgo
  );
  const totalInvoiced12m = invoices12m.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const payments12m = safePayments.filter(
    (p) => p.paymentDate && p.paymentDate >= twelveMonthsAgo
  );
  const totalCollected12m = payments12m.reduce((sum, p) => sum + p.amount, 0);

  const totalOutstandingNow = safeInvoices.reduce(
    (sum, inv) => sum + (inv.status === "void" ? 0 : inv.outstanding),
    0
  );

  const overdueInvoices = safeInvoices.filter((inv) => inv.status === "overdue");
  const overdueAmountNow = overdueInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);

  const highRiskExposureNow = overdueInvoices
    .filter((inv) => inv.riskLevel === "high")
    .reduce((sum, inv) => sum + inv.outstanding, 0);

  // Calculate DSO (rolling 3 months)
  let dsoRolling3m = 0;
  const fullyPaid3m = safeInvoices.filter(
    (inv) => inv.outstanding <= 0 && inv.issueDate && new Date(inv.issueDate) >= threeMonthsAgo
  );

  if (fullyPaid3m.length > 0 && safePayments.length > 0) {
    const daysToPay: number[] = [];
    for (const inv of fullyPaid3m) {
      const issue = new Date(inv.issueDate!);
      const relevantPayments = safePayments.filter(
        (p) => p.paymentDate && p.paymentDate >= threeMonthsAgo && p.invoiceId === inv.id
      );
      if (relevantPayments.length === 0) continue;
      const lastPayment = relevantPayments
        .map((p) => p.paymentDate!.getTime())
        .sort((a, b) => b - a)[0];
      const days = Math.max(
        Math.round((lastPayment - issue.getTime()) / (1000 * 60 * 60 * 24)),
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

  const paymentsPrev12m = safePayments.filter(
    (p) =>
      p.paymentDate &&
      p.paymentDate >= previousTwelveMonthsAgo &&
      p.paymentDate < twelveMonthsAgo
  );
  const totalCollectedPrev12m = paymentsPrev12m.reduce((sum, p) => sum + p.amount, 0);

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

    // Collected for this month
    const monthPayments = safePayments.filter((p) => {
      if (!p.paymentDate) return false;
      return p.paymentDate >= monthStart && p.paymentDate <= monthEnd;
    });
    monthlyTrends.collected.push(
      monthPayments.reduce((sum, p) => sum + p.amount, 0)
    );

    // Overdue at end of this month (invoices due before month end that are still unpaid)
    const overdueAtMonthEnd = safeInvoices.filter((inv) => {
      if (!inv.dueDate || inv.status === "paid" || inv.status === "void") return false;
      const dueDate = new Date(inv.dueDate);
      return dueDate <= monthEnd;
    });
    monthlyTrends.overdue.push(
      overdueAtMonthEnd.reduce((sum, inv) => sum + inv.outstanding, 0)
    );

    // High-risk at end of this month
    const highRiskAtMonthEnd = overdueAtMonthEnd.filter((inv) => inv.riskLevel === "high");
    monthlyTrends.highRisk.push(
      highRiskAtMonthEnd.reduce((sum, inv) => sum + inv.outstanding, 0)
    );

    // Outstanding at end of this month (simplified: current outstanding for all invoices issued up to month end)
    const outstandingAtMonthEnd = safeInvoices.filter((inv) => {
      if (!inv.issueDate || inv.status === "void") return false;
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
    totals: {
      totalInvoiced: totalInvoiced12m,
      totalCollected: totalCollected12m,
      totalOutstanding: totalOutstandingNow,
      overdueAmount: overdueAmountNow,
      highRiskExposure: highRiskExposureNow,
      dso: dsoRolling3m,
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
      invoicedLabel: "12 months",
      collectedLabel: "12 months",
      outstandingLabel: "Open balance",
      overdueLabel: "Overdue",
      highRiskLabel: "High-risk overdue",
      dsoLabel: "Rolling 3 months",
    },
  };
}
