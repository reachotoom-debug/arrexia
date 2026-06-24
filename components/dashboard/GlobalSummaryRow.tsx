import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import type { DashboardSummary } from "@/app/[workspaceId]/dashboard/_types/dashboard";
import { DollarSign, TrendingUp, AlertTriangle, Target, Calendar } from "lucide-react";

interface GlobalSummaryRowProps {
  summary: DashboardSummary;
}

export function GlobalSummaryRow({ summary }: GlobalSummaryRowProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      <KPI
        label="Total Invoiced"
        value={formatCurrency(summary.totalInvoiced, { currency: "USD" })}
        icon={DollarSign}
        iconBgColor="bg-blue-100"
      />
      <KPI
        label="Total Collected"
        value={formatCurrency(summary.totalCollected, { currency: "USD" })}
        icon={TrendingUp}
        iconBgColor="bg-emerald-100"
      />
      <KPI
        label="Total Outstanding"
        value={formatCurrency(summary.totalOutstanding, { currency: "USD" })}
        icon={AlertTriangle}
        iconBgColor="bg-amber-100"
      />
      <KPI
        label="Overdue Amount"
        value={formatCurrency(summary.overdueAmount, { currency: "USD" })}
        icon={AlertTriangle}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="High-Risk Exposure"
        value={formatCurrency(summary.highRiskExposure, { currency: "USD" })}
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
