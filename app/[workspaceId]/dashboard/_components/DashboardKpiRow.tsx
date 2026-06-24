"use client";

import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "./KPI";
import { AlertTriangle, Calendar, TrendingUp, Wallet } from "lucide-react";
import type { DashboardSummaryPremium } from "./PremiumKpiRow";

interface DashboardKpiRowProps {
  summary: DashboardSummaryPremium | null;
  currency?: string;
  /** If true, show 5th card: Payments received (last 30 days) */
  showPaymentsLast30Days?: boolean;
}

export function DashboardKpiRow({
  summary,
  currency,
  showPaymentsLast30Days = true,
}: DashboardKpiRowProps) {
  if (!summary) return null;

  const { totals, defaultCurrency: workspaceCurrency } = summary;
  const currencyCode = currency ?? workspaceCurrency ?? "USD";
  const collectionRate =
    totals.totalInvoiced > 0
      ? (totals.totalCollected / totals.totalInvoiced) * 100
      : null;

  const fmt = (amount: number) =>
    formatCurrency(amount, { currency: currencyCode, fallbackCurrency: "USD" });

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      <KPI
        title="High-Risk Outstanding"
        value={fmt(totals.highRiskExposure)}
        subtext="Invoices marked high priority"
        intent="danger"
        icon={AlertTriangle}
      />
      <KPI
        title="Total Outstanding (Overdue)"
        value={fmt(totals.overdueAmount)}
        subtext="Includes all overdue invoices"
        intent="danger"
        icon={AlertTriangle}
      />
      <KPI
        title="Collection Rate"
        value={
          collectionRate !== null ? `${collectionRate.toFixed(1)}%` : "—"
        }
        subtext="Collection efficiency (lifetime)"
        intent={collectionRate !== null && collectionRate >= 85 ? "success" : "default"}
        icon={TrendingUp}
      />
      <KPI
        title="Avg Days to Pay"
        value={totals.dso > 0 ? `${totals.dso} days` : "—"}
        subtext="Rolling 3 months"
        icon={Calendar}
      />
      {showPaymentsLast30Days && (() => {
        const amount = totals.paymentsLast30Days ?? 0;
        const count = totals.paymentsLast30DaysCount ?? 0;
        const formatted = fmt(amount);
        return (
          <KPI
            title="Collected (Last 30 Days)"
            value={formatted}
            subtext="From completed payments"
            intent="success"
            icon={Wallet}
          />
        );
      })()}
    </div>
  );
}
