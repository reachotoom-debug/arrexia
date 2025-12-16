import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import type { DashboardSummary } from "@/app/[workspaceId]/dashboard/_types/dashboard";
import { DollarSign, TrendingUp, AlertTriangle, Target, Calendar } from "lucide-react";

interface GlobalSummaryRowProps {
  summary: DashboardSummary;
}

export function GlobalSummaryRow({ summary }: GlobalSummaryRowProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      <KPI
        label="Total Invoiced"
        value={formatMoney(summary.totalInvoiced, "USD")}
        icon={DollarSign}
        iconBgColor="bg-blue-100"
      />
      <KPI
        label="Total Collected"
        value={formatMoney(summary.totalCollected, "USD")}
        icon={TrendingUp}
        iconBgColor="bg-emerald-100"
      />
      <KPI
        label="Total Outstanding"
        value={formatMoney(summary.totalOutstanding, "USD")}
        icon={AlertTriangle}
        iconBgColor="bg-amber-100"
      />
      <KPI
        label="Overdue Amount"
        value={formatMoney(summary.overdueAmount, "USD")}
        icon={AlertTriangle}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="High-Risk Exposure"
        value={formatMoney(summary.highRiskExposure, "USD")}
        icon={Target}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="DSO"
        value={summary.dso !== null ? `${summary.dso} days` : "—"}
        subtext="Average Days to Pay"
        icon={Calendar}
        iconBgColor="bg-slate-100"
      />
    </div>
  );
}
