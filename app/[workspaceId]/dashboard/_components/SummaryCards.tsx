import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "./KPI";
import type { DashboardSummary } from "../../_types/dashboard";
import { DollarSign, TrendingUp, AlertTriangle, Target, Calendar } from "lucide-react";

interface SummaryCardsProps {
  data: DashboardSummary;
}

export function SummaryCards({ data }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      <KPI
        label="Total Invoiced"
        value={formatCurrency(data.totalInvoiced12m, { currency: "USD" })}
        subtext="12 months"
        icon={DollarSign}
        iconBgColor="bg-blue-100"
      />
      <KPI
        label="Total Collected"
        value={formatCurrency(data.totalCollected12m, { currency: "USD" })}
        subtext="12 months"
        icon={TrendingUp}
        iconBgColor="bg-emerald-100"
      />
      <KPI
        label="Total Outstanding"
        value={formatCurrency(data.totalOutstandingNow, { currency: "USD" })}
        icon={AlertTriangle}
        iconBgColor="bg-amber-100"
      />
      <KPI
        label="Overdue Amount"
        value={formatCurrency(data.overdueAmountNow, { currency: "USD" })}
        icon={AlertTriangle}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="High-Risk Exposure"
        value={formatCurrency(data.highRiskExposureNow, { currency: "USD" })}
        icon={Target}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="DSO"
        value={data.dsoRolling3m !== null ? `${data.dsoRolling3m} days` : "—"}
        subtext="Rolling 3 months"
        icon={Calendar}
        iconBgColor="bg-slate-100"
      />
    </div>
  );
}
