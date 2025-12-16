import { formatMoney } from "@/lib/invoices/utils";
import { AlertTriangle, AlertCircle, TrendingUp, Info } from "lucide-react";
import type { DashboardSummaryPremium } from "./PremiumKpiRow";

type InsightLevel = "critical" | "warning" | "positive" | "neutral";

type DashboardInsight = {
  level: InsightLevel;
  title: string;
  detail: string;
};

interface DashboardInsightProps {
  summary: DashboardSummaryPremium | null;
}

// Helper formatters
function formatCurrency(value: number): string {
  return formatMoney(value, "USD");
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}%` : `${rounded.toFixed(1)}%`;
}

// Business logic constants
const HIGH_OVERDUE_RATIO = 0.45;
const ELEVATED_OVERDUE_RATIO = 0.30;
const HIGH_RISK_RATIO = 0.40;
const GOOD_COLLECTION_RATE = 0.85;
const BAD_COLLECTION_RATE = 0.70;
const HIGH_DSO = 45;
const VERY_HIGH_DSO = 60;
const IMPROVING_DELTA = -10;
const WORSENING_DELTA = 10;

function getDashboardInsight(summary: DashboardSummaryPremium): DashboardInsight {
  const { totals, deltas } = summary;

  // Derived metrics
  const overdueRatio = totals.totalOutstanding > 0
    ? totals.overdueAmount / totals.totalOutstanding
    : 0;
  const highRiskRatio = totals.overdueAmount > 0
    ? totals.highRiskExposure / totals.overdueAmount
    : 0;
  const collectionRate = totals.totalInvoiced > 0
    ? totals.totalCollected / totals.totalInvoiced
    : 0;

  // Rule 1: Critical – high risk concentration
  if (
    overdueRatio >= HIGH_OVERDUE_RATIO &&
    highRiskRatio >= HIGH_RISK_RATIO
  ) {
    return {
      level: "critical",
      title: "High-risk exposure is concentrated in your overdue balance.",
      detail: `${formatCurrency(totals.highRiskExposure)} high-risk overdue across ${(overdueRatio * 100).toFixed(0)}% of outstanding. Prioritize these invoices in Collections mode.`,
    };
  }

  // Rule 2: Critical – overdue spiking
  if (
    deltas.overduePct >= WORSENING_DELTA &&
    overdueRatio >= ELEVATED_OVERDUE_RATIO
  ) {
    return {
      level: "critical",
      title: "Overdue balance is growing.",
      detail: `Overdue increased ${formatPct(deltas.overduePct)} and now represents ${(overdueRatio * 100).toFixed(0)}% of outstanding. Consider tightening reminders or terms.`,
    };
  }

  // Rule 3: Warning – DSO rising
  if (
    totals.dso >= VERY_HIGH_DSO ||
    (totals.dso >= HIGH_DSO && deltas.dsoPct >= WORSENING_DELTA)
  ) {
    return {
      level: "warning",
      title: "Customers are taking longer to pay.",
      detail: `DSO is ${Math.round(totals.dso)} days (${formatPct(deltas.dsoPct)} vs last period). Focus on large open invoices and follow-up cadence.`,
    };
  }

  // Rule 4: Warning – overdue elevated
  if (
    overdueRatio >= ELEVATED_OVERDUE_RATIO &&
    deltas.overduePct > IMPROVING_DELTA
  ) {
    return {
      level: "warning",
      title: "Overdue balance is elevated.",
      detail: `${(overdueRatio * 100).toFixed(0)}% of outstanding is overdue. Use Collections mode to clear medium-risk invoices earlier.`,
    };
  }

  // Rule 5: Positive – collections improving
  // Note: WORSENING_DELTA * 1.2 = 12%, meaning collections increased by at least 12%
  if (
    deltas.collectedPct >= Math.abs(WORSENING_DELTA) * 1.2 &&
    deltas.overduePct <= IMPROVING_DELTA
  ) {
    return {
      level: "positive",
      title: "Collections performance is improving.",
      detail: `Collected up ${formatPct(deltas.collectedPct)}, overdue down ${formatPct(deltas.overduePct)} vs last period. Keep your current follow-up cadence.`,
    };
  }

  // Rule 6: Positive – strong AR health
  if (
    collectionRate >= GOOD_COLLECTION_RATE &&
    overdueRatio < ELEVATED_OVERDUE_RATIO
  ) {
    return {
      level: "positive",
      title: "AR health is solid.",
      detail: `${(collectionRate * 100).toFixed(0)}% of invoiced amount collected and only ${(overdueRatio * 100).toFixed(0)}% is overdue.`,
    };
  }

  // Rule 7: Neutral fallback
  return {
    level: "neutral",
    title: "Steady AR performance.",
    detail: "No major changes in overdue, collections, or DSO this period. Keep monitoring your high-risk invoices.",
  };
}

export function DashboardInsight({ summary }: DashboardInsightProps) {
  if (!summary || !summary.totals) {
    return null;
  }

  const insight = getDashboardInsight(summary);
  const { totals } = summary;

  // Icon and color mapping
  const iconConfig = {
    critical: {
      icon: AlertTriangle,
      bgColor: "bg-rose-100",
      textColor: "text-rose-600",
    },
    warning: {
      icon: AlertCircle,
      bgColor: "bg-amber-100",
      textColor: "text-amber-600",
    },
    positive: {
      icon: TrendingUp,
      bgColor: "bg-emerald-100",
      textColor: "text-emerald-600",
    },
    neutral: {
      icon: Info,
      bgColor: "bg-slate-100",
      textColor: "text-slate-500",
    },
  };

  const config = iconConfig[insight.level];
  const Icon = config.icon;

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-3.5">
      {/* Left side: Icon + Text */}
      <div className="flex items-start gap-3 md:items-center">
        {/* Icon pill */}
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor}`}>
          <Icon className={`h-4 w-4 ${config.textColor}`} />
        </div>

        {/* Text block */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 md:text-[15px]">
            {insight.title}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 md:text-[13px]">
            {insight.detail}
          </div>
        </div>
      </div>

      {/* Right side: Metric pills (hidden on mobile) */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
          Overdue: {formatCurrency(totals.overdueAmount)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
          High-risk: {formatCurrency(totals.highRiskExposure)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
          DSO: {Math.round(totals.dso)} days
        </span>
      </div>
    </div>
  );
}
