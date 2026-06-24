// @ts-nocheck
import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "../_components/KPI";
import { OverdueAmountChart } from "../_components/OverdueAmountChart";
import { RevenueChart } from "../_components/RevenueChart";
import { RecentActivity } from "../_components/RecentActivity";
import { UpcomingInvoicesTable } from "./UpcomingInvoicesTable";
import type { DashboardData } from "../_types/dashboard";
import { Users, FileText, DollarSign, AlertTriangle } from "lucide-react";

interface StandardDashboardTabProps {
  data: DashboardData;
}

export default function StandardDashboardTab({ data }: StandardDashboardTabProps) {
  // Convert aging buckets for chart
  const agingChartData = data.agingBuckets.map((bucket) => {
    const labelMap: Record<string, string> = {
      "0-30": "0–30 days",
      "31-60": "31–60 days",
      "61-90": "61–90 days",
      "90+": "90+ days",
    };
    const keyMap: Record<string, string> = {
      "0-30": "d0_30",
      "31-60": "d31_60",
      "61-90": "d61_90",
      "90+": "d90_plus",
    };
    return {
      label: labelMap[bucket.bucket] || `${bucket.bucket} days`,
      key: keyMap[bucket.bucket] || `d${bucket.bucket.replace("-", "_")}`,
      amount: bucket.amount,
      formattedAmount: formatCurrency(bucket.amount, { currency: "USD" }),
    };
  });

  // Convert monthly revenue for payments chart (paidAmount only)
  const paymentsChartData = data.monthlyRevenue.slice(-6).map((point) => ({
    month: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    revenue: point.paidAmount,
  }));

  // Convert recent invoices for table
  const recentInvoicesForTable = data.recentInvoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    status: inv.status,
    issue_date: inv.issueDate ?? "",
    client_name: inv.clientName ?? undefined,
    clients: inv.clientName ? { name: inv.clientName } : null,
    amount: inv.totalAmount,
    total: inv.totalAmount,
    currency: "USD",
  }));

  // Convert upcoming invoices for table
  const upcomingInvoicesForTable = data.upcomingInvoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    status: inv.status,
    issue_date: inv.issueDate ?? "",
    due_date: inv.dueDate ?? "",
    client_name: inv.clientName ?? undefined,
    clients: inv.clientName ? { name: inv.clientName } : null,
    amount: inv.totalAmount,
    total: inv.totalAmount,
    currency: "USD",
  }));

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Total Clients"
          value={data.totals.totalClients}
          icon={Users}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Total Invoices"
          value={data.totals.totalInvoices}
          icon={FileText}
        />
        <KPI
          label="Total Paid"
          value={formatCurrency(data.totals.totalPaid, { currency: "USD" })}
          icon={DollarSign}
          iconBgColor="bg-emerald-100"
        />
        <KPI
          label="Total Outstanding"
          value={formatCurrency(data.totals.totalOutstanding, { currency: "USD" })}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <OverdueAmountChart data={agingChartData} currency="USD" />
        <RevenueChart data={paymentsChartData} />
      </div>

      {/* Row 3: Tables */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RecentActivity invoices={recentInvoicesForTable} workspaceId={data.workspaceId} />
        <UpcomingInvoicesTable invoices={upcomingInvoicesForTable} workspaceId={data.workspaceId} />
      </div>
    </div>
  );
}
