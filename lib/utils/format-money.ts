import { formatCurrency } from "@/lib/format/currency";

/**
 * @deprecated Use formatCurrency from @/lib/format/currency instead.
 * This function is kept for backward compatibility.
 */
export function formatMoney(amount: number, currency: string = "USD") {
  return formatCurrency(amount, { currency });
}

// Re-export from centralized module
export { formatCurrency } from "@/lib/format/currency";

