import Link from "next/link";
import { formatCurrency as formatCurrencyHelper } from "@/lib/format/currency";
import { FIRST_RUN_DASHBOARD_INSIGHT } from "@/lib/onboarding/workspaceOnboardingState";
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
  workspaceId: string;
}

function formatCurrency(value: number): string {
  return formatCurrencyHelper(value, { currency: "USD" });
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}%` : `${rounded.toFixed(1)}%`;
}

const HIGH_OVERDUE_RATIO = 0.45;
const ELEVATED_OVERDUE_RATIO = 0.30;
const HIGH_RISK_RATIO = 0.40;
const GOOD_COLLECTION_RATE = 0.85;
const IMPROVING_DELTA = -10;
const WORSENING_DELTA = 10;

function getDashboardInsight(summary: DashboardSummaryPremium): DashboardInsight {
  const { totals, deltas } = summary;

  if (totals.totalInvoiced === 0 && totals.totalOutstanding === 0) {
    return FIRST_RUN_DASHBOARD_INSIGHT;
  }

  const overdueRatio = totals.totalOutstanding > 0
    ? totals.overdueAmount / totals.totalOutstanding
    : 0;
  const highRiskRatio = totals.overdueAmount > 0
    ? totals.highRiskExposure / totals.overdueAmount
    : 0;
  const collectionRate = totals.totalInvoiced > 0
    ? totals.totalCollected / totals.totalInvoiced
    : 0;

  if (
    overdueRatio >= HIGH_OVERDUE_RATIO &&
    highRiskRatio >= HIGH_RISK_RATIO
  ) {
    return {
      level: "critical",
      title: "Most of your outstanding is high-risk.",
      detail: "Start with these invoices in Collections.",
    };
  }

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

  if (
    overdueRatio >= ELEVATED_OVERDUE_RATIO &&
    deltas.overduePct > IMPROVING_DELTA
  ) {
    return {
      level: "warning",
      title: "Overdue balance is elevated.",
      detail: `${(overdueRatio * 100).toFixed(0)}% of outstanding is overdue. Use Collections to work medium-risk invoices earlier.`,
    };
  }

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

  return {
    level: "neutral",
    title: "Steady AR performance.",
    detail: "No major changes in overdue or collections this period. Keep monitoring your high-risk invoices.",
  };
}

export function DashboardInsight({ summary, workspaceId }: DashboardInsightProps) {
  if (!summary || !summary.totals) {
    return null;
  }

  const insight = getDashboardInsight(summary);
  const { totals } = summary;

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
      <div className="flex items-start gap-3 md:items-center">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor}`}>
          <Icon className={`h-4 w-4 ${config.textColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 md:text-[15px]">
            {insight.title}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 md:text-[13px]">
            {insight.detail}
          </div>
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
          Overdue: {formatCurrency(totals.overdueAmount)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
          High-risk: {formatCurrency(totals.highRiskExposure)}
        </span>
        <Link
          href={`/${workspaceId}/collections`}
          className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-3 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
        >
          Open Collections →
        </Link>
      </div>
    </div>
  );
}
