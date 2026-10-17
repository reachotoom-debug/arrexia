import { formatCurrency } from "@/lib/format/currency";

/** Display currency balances without implying conversion or netting currencies. */
export function formatClientCurrencyAmounts(totals: Record<string, number>): string {
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => /^[A-Z]{3}$/.test(currency)
      ? `${formatCurrency(amount, { currency })} ${currency}`
      : `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(" / ") || "--";
}

export function sumClientCurrencyAmounts<T extends { currency?: string | null }>(
  rows: T[], amount: (row: T) => number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = row.currency?.trim().toUpperCase() || "Unknown currency";
    totals[currency] = (totals[currency] ?? 0) + amount(row);
  }
  return totals;
}
