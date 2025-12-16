import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "./KPI";
import type { DashboardSummary } from "../../_types/dashboard";
import { DollarSign, TrendingUp, AlertTriangle, Target, Calendar } from "lucide-react";

interface SummaryCardsProps {
  data: DashboardSummary;
}

export function SummaryCards({ data }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      <KPI
        label="Total Invoiced"
        value={formatMoney(data.totalInvoiced12m, "USD")}
        subtext="12 months"
        icon={DollarSign}
        iconBgColor="bg-blue-100"
      />
      <KPI
        label="Total Collected"
        value={formatMoney(data.totalCollected12m, "USD")}
        subtext="12 months"
        icon={TrendingUp}
        iconBgColor="bg-emerald-100"
      />
      <KPI
        label="Total Outstanding"
        value={formatMoney(data.totalOutstandingNow, "USD")}
        icon={AlertTriangle}
        iconBgColor="bg-amber-100"
      />
      <KPI
        label="Overdue Amount"
        value={formatMoney(data.overdueAmountNow, "USD")}
        icon={AlertTriangle}
        iconBgColor="bg-red-100"
      />
      <KPI
        label="High-Risk Exposure"
        value={formatMoney(data.highRiskExposureNow, "USD")}
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
