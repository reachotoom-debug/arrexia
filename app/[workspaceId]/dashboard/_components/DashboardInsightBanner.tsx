"use client";

import type { DashboardInsight } from "../../_types/dashboard";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface DashboardInsightBannerProps {
  insight: DashboardInsight | null;
}

export function DashboardInsightBanner({ insight }: DashboardInsightBannerProps) {
  if (!insight) {
    return null;
  }

  // Map severities to styles
  const severityStyles = {
    good: {
      bg: "bg-gradient-to-br from-emerald-50 to-emerald-100/50",
      border: "border-emerald-200",
      iconBg: "bg-emerald-200",
      iconColor: "text-emerald-700",
      titleColor: "text-emerald-900",
      textColor: "text-emerald-800",
      deltaColor: "text-emerald-700",
    },
    neutral: {
      bg: "bg-gradient-to-br from-slate-50 to-slate-100/50",
      border: "border-slate-200",
      iconBg: "bg-slate-200",
      iconColor: "text-slate-700",
      titleColor: "text-slate-900",
      textColor: "text-slate-800",
      deltaColor: "text-slate-600",
    },
    warning: {
      bg: "bg-gradient-to-br from-amber-50 to-amber-100/50",
      border: "border-amber-200",
      iconBg: "bg-amber-200",
      iconColor: "text-amber-700",
      titleColor: "text-amber-900",
      textColor: "text-amber-800",
      deltaColor: "text-amber-700",
    },
    critical: {
      bg: "bg-gradient-to-br from-red-50 to-red-100/50",
      border: "border-red-200",
      iconBg: "bg-red-200",
      iconColor: "text-red-700",
      titleColor: "text-red-900",
      textColor: "text-red-800",
      deltaColor: "text-red-700",
    },
  };

  const styles = severityStyles[insight.severity];

  const IconComponent =
    insight.severity === "good"
      ? CheckCircle2
      : insight.severity === "critical" || insight.severity === "warning"
      ? AlertTriangle
      : Info;

  const deltaValue = insight.deltaValue;
  const isPositiveDelta = deltaValue ? deltaValue.startsWith("+") : false;
  const DeltaIcon = deltaValue && isPositiveDelta ? ArrowUpRight : deltaValue && !isPositiveDelta && deltaValue !== "0%" ? ArrowDownRight : null;

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 shadow-sm`}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}>
          <IconComponent className={`h-5 w-5 ${styles.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-semibold ${styles.titleColor} mb-1`}>{insight.title}</h3>
              <p className={`text-sm ${styles.textColor} leading-relaxed`}>{insight.message}</p>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Primary Metric */}
              <div className="text-right">
                <div className={`text-xs font-medium ${styles.textColor} mb-0.5`}>
                  {insight.primaryMetricLabel}
                </div>
                <div className={`text-lg font-semibold ${styles.titleColor}`}>
                  {insight.primaryMetricValue}
                </div>
              </div>

              {/* Delta */}
              {insight.deltaLabel && insight.deltaValue && (
                <div className="text-right">
                  <div className={`text-xs font-medium ${styles.textColor} mb-0.5`}>
                    {insight.deltaLabel}
                  </div>
                  <div className={`inline-flex items-center gap-1 text-sm font-semibold ${styles.deltaColor}`}>
                    {DeltaIcon && <DeltaIcon className="h-3.5 w-3.5" />}
                    <span>{insight.deltaValue}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
