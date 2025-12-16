import { formatMoney } from "@/lib/invoices/utils";
import { DollarSign, TrendingUp, AlertTriangle, Target, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MetricCard } from "./MetricCard";

export interface DashboardSummaryPremium {
  totals: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    overdueAmount: number;
    highRiskExposure: number;
    dso: number;
  };
  trends: {
    invoiced: number[];
    collected: number[];
    outstanding: number[];
    overdue: number[];
    highRisk: number[];
    dso: number[];
  };
  deltas: {
    invoicedPct: number;
    collectedPct: number;
    outstandingPct: number;
    overduePct: number;
    highRiskPct: number;
    dsoPct: number;
  };
  periods: {
    invoicedLabel: string;
    collectedLabel: string;
    outstandingLabel: string;
    overdueLabel: string;
    highRiskLabel: string;
    dsoLabel: string;
  };
}

interface PremiumKpiRowProps {
  summary: DashboardSummaryPremium | null;
  isLoading?: boolean;
}

type MetricConfig = {
  key: keyof DashboardSummaryPremium["totals"];
  label: string;
  periodKey: keyof DashboardSummaryPremium["periods"];
  deltaKey: keyof DashboardSummaryPremium["deltas"];
  trendKey: keyof DashboardSummaryPremium["trends"];
  icon: LucideIcon;
  inverse: boolean;
  period: string;
  bottomLabel: string;
  valueColor: string;
  sparklineColors: {
    stroke: string;
    fill: string;
  };
  formatter: (value: number) => string;
};

export function PremiumKpiRow({ summary, isLoading = false }: PremiumKpiRowProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="relative flex min-h-[120px] items-stretch justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const metrics: MetricConfig[] = [
    {
      key: "totalInvoiced",
      label: "Total Invoiced",
      periodKey: "invoicedLabel",
      deltaKey: "invoicedPct",
      trendKey: "invoiced",
      icon: DollarSign,
      inverse: false,
      period: "12 months",
      bottomLabel: "Billed last 12 months",
      valueColor: "text-blue-700",
      sparklineColors: {
        stroke: "stroke-blue-400",
        fill: "fill-blue-100/40",
      },
      formatter: (v) => formatMoney(v, "USD"),
    },
    {
      key: "totalCollected",
      label: "Total Collected",
      periodKey: "collectedLabel",
      deltaKey: "collectedPct",
      trendKey: "collected",
      icon: TrendingUp,
      inverse: false,
      period: "12 months",
      bottomLabel: "Payments received",
      valueColor: "text-emerald-700",
      sparklineColors: {
        stroke: "stroke-emerald-400",
        fill: "fill-emerald-100/40",
      },
      formatter: (v) => formatMoney(v, "USD"),
    },
    {
      key: "totalOutstanding",
      label: "Total Outstanding",
      periodKey: "outstandingLabel",
      deltaKey: "outstandingPct",
      trendKey: "outstanding",
      icon: AlertTriangle,
      inverse: false,
      period: "Open balance",
      bottomLabel: "Unpaid & partially paid",
      valueColor: "text-amber-700",
      sparklineColors: {
        stroke: "stroke-amber-400",
        fill: "fill-amber-100/40",
      },
      formatter: (v) => formatMoney(v, "USD"),
    },
    {
      key: "overdueAmount",
      label: "Overdue Amount",
      periodKey: "overdueLabel",
      deltaKey: "overduePct",
      trendKey: "overdue",
      icon: AlertTriangle,
      inverse: true,
      period: "Past due invoices",
      bottomLabel: "Overdue balance",
      valueColor: "text-rose-600",
      sparklineColors: {
        stroke: "stroke-rose-400",
        fill: "fill-rose-100/40",
      },
      formatter: (v) => formatMoney(v, "USD"),
    },
    {
      key: "highRiskExposure",
      label: "High-Risk Exposure",
      periodKey: "highRiskLabel",
      deltaKey: "highRiskPct",
      trendKey: "highRisk",
      icon: Target,
      inverse: true,
      period: "High-risk overdue",
      bottomLabel: "Top-risk clients",
      valueColor: "text-red-700",
      sparklineColors: {
        stroke: "stroke-red-400",
        fill: "fill-red-100/40",
      },
      formatter: (v) => formatMoney(v, "USD"),
    },
    {
      key: "dso",
      label: "DSO",
      periodKey: "dsoLabel",
      deltaKey: "dsoPct",
      trendKey: "dso",
      icon: Calendar,
      inverse: true,
      period: "Rolling 3 months",
      bottomLabel: "Days sales outstanding",
      valueColor: "text-indigo-700",
      sparklineColors: {
        stroke: "stroke-indigo-400",
        fill: "fill-indigo-100/40",
      },
      formatter: (v) => `${Math.round(v)} days`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => {
        const value = summary.totals[metric.key];
        const delta = summary.deltas[metric.deltaKey];
        const trend = summary.trends[metric.trendKey];

        return (
          <MetricCard
            key={metric.key}
            label={metric.label}
            period={metric.period}
            value={metric.formatter(value)}
            valueColor={metric.valueColor}
            delta={delta}
            deltaInverse={metric.inverse}
            bottomLabel={metric.bottomLabel}
            icon={metric.icon}
            trend={trend}
            sparklineColors={metric.sparklineColors}
          />
        );
      })}
    </div>
  );
}
