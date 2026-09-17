import { computePortfolioExposureByCurrency, formatPortfolioExposureLabel } from "@/lib/collections/portfolioSummary";

export type KpiMoneyTotal = { currency: string | null; amount: number };

/** Keep amounts grouped; never construct a cross-currency financial total. */
export function addKpiMoneyTotal(totals: Map<string | null, number>, amount: number, currency: string | null | undefined) {
  if (!Number.isFinite(amount)) throw new Error("Invalid monetary value in KPI summary");
  if (amount === 0) return;
  const key = currency?.trim().toUpperCase() || null;
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

export function getKpiMoneyTotals(totals: Map<string | null, number>): KpiMoneyTotal[] {
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => (a.currency ?? "").localeCompare(b.currency ?? ""));
}

/** Reuse the existing portfolio presentation: one amount, or separate currency amounts. */
export function formatKpiMoneyTotals(totals: KpiMoneyTotal[], defaultCurrency: string) {
  return formatPortfolioExposureLabel(computePortfolioExposureByCurrency(
    totals.map(row => ({ currency: row.currency, outstanding: row.amount })), defaultCurrency
  ), defaultCurrency);
}
