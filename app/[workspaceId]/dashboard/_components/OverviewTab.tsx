// @ts-nocheck
import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "./KPI";
import { OverdueAmountChart } from "./OverdueAmountChart";
import { OverdueTrendChart } from "./OverdueTrendChart";
import { RecentActivity } from "./RecentActivity";
import { OverdueInvoicesTable } from "./OverdueInvoicesTable";
import type { DashboardData } from "../_types/dashboard";
import { DollarSign, AlertTriangle, Calendar, TrendingUp } from "lucide-react";

interface OverviewTabProps {
  workspaceId: string;
  data: DashboardData;
}

export function OverviewTab({ workspaceId, data }: OverviewTabProps) {
  const { kpis, agingBuckets, overdueTrend, recentInvoices, overdueInvoices } = data;

  // Calculate paid change percentage
  const paidChangePercent =
    kpis.paidLastMonth > 0
      ? ((kpis.paidThisMonth - kpis.paidLastMonth) / kpis.paidLastMonth) * 100
      : 0;

  const paidChangeLabel = kpis.paidLastMonth > 0
    ? `vs last month ${paidChangePercent >= 0 ? "+" : ""}${paidChangePercent.toFixed(1)}%`
    : undefined;

  // Convert aging buckets for chart
  const agingChartData = agingBuckets.map((bucket) => {
    const labelMap: Record<string, string> = {
      "0–30": "0–30 days",
      "31–60": "31–60 days",
      "61–90": "61–90 days",
      "90+": "90+ days",
    };
    const keyMap: Record<string, string> = {
      "0–30": "d0_30",
      "31–60": "d31_60",
      "61–90": "d61_90",
      "90+": "d90_plus",
    };
    return {
      label: labelMap[bucket.label] || `${bucket.label} days`,
      key: keyMap[bucket.label] || `d${bucket.label.replace("–", "_").replace("+", "_plus")}`,
      amount: bucket.amount,
      formattedAmount: formatCurrency(bucket.amount, { currency: "USD" }),
    };
  });

  // Convert recent invoices for table
  const recentInvoicesForTable = recentInvoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    status: inv.status,
    issue_date: inv.issueDate,
    client_name: inv.clientName ?? undefined,
    clients: inv.clientName ? { name: inv.clientName } : null,
    amount: inv.totalAmount,
    total: inv.totalAmount,
    currency: "USD",
  }));

  // Convert overdue invoices for table
  const overdueInvoicesForTable = overdueInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName ?? "—",
    status: inv.status as "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "void",
    issueDate: null,
    dueDate: null,
    totalAmount: 0,
    amountPaid: 0,
    outstanding: inv.outstanding,
    overdueDays: inv.overdueDays,
    riskLevel: inv.riskLevel,
  }));

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Total outstanding"
          value={formatCurrency(kpis.totalOutstanding, { currency: "USD" })}
          subtext={`${kpis.openInvoiceCount} open invoices`}
          icon={DollarSign}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Overdue amount"
          value={formatCurrency(kpis.totalOverdue, { currency: "USD" })}
          subtext={`${kpis.overdueInvoiceCount} overdue invoices`}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Average days to pay"
          value={kpis.averageDaysToPay90d !== null ? `${kpis.averageDaysToPay90d}` : "—"}
          subtext="Last 90 days"
          icon={Calendar}
          iconBgColor="bg-slate-100"
        />
        <KPI
          label="Paid this month"
          value={formatCurrency(kpis.paidThisMonth, { currency: "USD" })}
          subtext={paidChangeLabel}
          deltaLabel={paidChangeLabel}
          deltaDirection={
            paidChangePercent > 0 ? "up" : paidChangePercent < 0 ? "down" : "flat"
          }
          icon={TrendingUp}
          iconBgColor="bg-emerald-100"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <OverdueAmountChart data={agingChartData} currency="USD" />
        <OverdueTrendChart data={overdueTrend} currency="USD" />
      </div>

      {/* Row 3: Tables */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RecentActivity invoices={recentInvoicesForTable} workspaceId={workspaceId} />
        <OverdueInvoicesTable invoices={overdueInvoicesForTable} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
