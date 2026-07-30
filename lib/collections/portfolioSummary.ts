import { computeOutstandingByCurrency } from "@/lib/actions/collectionActivity";
import { formatMoney } from "@/lib/utils/format-money";

/** Escalation rule: recommend escalate when both thresholds are met. Amount is compared in default currency; no conversion applied. */
export const COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS = 30;
export const COLLECTIONS_ESCALATION_MIN_OUTSTANDING = 5000;

export type PortfolioExposureRow = {
  outstanding: number;
  currency: string | null;
};

export function shouldRecommendEscalation(
  overdueDays: number,
  outstanding: number
): boolean {
  return (
    overdueDays >= COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS &&
    outstanding >= COLLECTIONS_ESCALATION_MIN_OUTSTANDING
  );
}

export function computePortfolioExposureByCurrency(
  rows: PortfolioExposureRow[],
  defaultCurrency = "USD"
) {
  return computeOutstandingByCurrency({
    outstandingAmounts: rows.map((row) => ({
      outstanding: row.outstanding,
      currency: row.currency,
    })),
    defaultCurrency,
  });
}

export function formatPortfolioExposureLabel(
  totals: Array<{ currency: string; amount: number }>
): { value: string; detail?: string } {
  if (totals.length === 0) {
    return { value: formatMoney(0, "USD") };
  }

  if (totals.length === 1) {
    const only = totals[0]!;
    return { value: formatMoney(only.amount, only.currency) };
  }

  return {
    value: totals.map((row) => formatMoney(row.amount, row.currency)).join(" · "),
    detail: "Totals shown separately by currency.",
  };
}

/** Overdue-day heat: 0-7 neutral gray, 8-30 amber, 31-60 orange, 61-90 rose, 90+ red. */
export function getOverdueHeatClasses(days: number): string {
  if (days <= 7) return "bg-slate-100 text-slate-700 ring-slate-200";
  if (days <= 30) return "bg-amber-100 text-amber-900 ring-amber-300";
  if (days <= 60) return "bg-orange-200 text-orange-900 ring-orange-400";
  if (days <= 90) return "bg-rose-200 text-rose-900 ring-rose-400";
  return "bg-red-300 text-red-900 ring-red-500";
}

export function getRiskBadgeClasses(riskLevel: string | null | undefined): string {
  switch (riskLevel) {
    case "high":
      return "bg-red-100 text-red-800 ring-red-200";
    case "medium":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "low":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

export function getRiskLabel(riskLevel: string | null | undefined): string {
  switch (riskLevel) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "—";
  }
}
