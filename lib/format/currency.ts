/**
 * Centralized currency formatter for the entire application.
 * Use this helper everywhere to ensure consistent currency display.
 */

export interface FormatCurrencyOptions {
  /**
   * The currency code for this specific amount (e.g., from invoice.currency).
   * Takes precedence over fallbackCurrency.
   */
  currency?: string | null;
  /**
   * Fallback currency code to use when currency is null/undefined.
   * Typically from workspace settings.default_currency.
   */
  fallbackCurrency?: string | null;
}

/**
 * Format a monetary amount with proper currency symbol.
 *
 * @param amount - The amount to format. Defaults to 0 if null/undefined.
 * @param options - Currency options with primary currency and fallback.
 * @returns Formatted currency string (e.g., "$1,234.56", "€1.234,56")
 *
 * @example
 * // Invoice-level: use invoice currency with workspace fallback
 * formatCurrency(invoice.amount, {
 *   currency: invoice.currency,
 *   fallbackCurrency: settings.default_currency,
 * })
 *
 * @example
 * // Workspace-level totals: use settings default
 * formatCurrency(totalAmount, { currency: settings.default_currency })
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: FormatCurrencyOptions = {}
): string {
  const { currency, fallbackCurrency } = options;

  // Default amount to 0 when null/undefined
  const safeAmount = amount ?? 0;

  // Handle NaN
  if (Number.isNaN(safeAmount)) {
    return "-";
  }

  // Determine currency code: currency > fallbackCurrency > "USD"
  const currencyCode = (currency || fallbackCurrency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    // Fallback for invalid currency codes
    console.warn(`[formatCurrency] Invalid currency code: ${currencyCode}, falling back to USD`);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }
}

/**
 * Format currency for chart axis labels (compact format).
 * Uses abbreviated numbers for large values (e.g., "$1.2K", "$1.5M").
 *
 * @param amount - The amount to format
 * @param options - Currency options
 * @returns Compact formatted currency string
 */
export function formatCurrencyCompact(
  amount: number | null | undefined,
  options: FormatCurrencyOptions = {}
): string {
  const { currency, fallbackCurrency } = options;
  const safeAmount = amount ?? 0;

  if (Number.isNaN(safeAmount)) {
    return "-";
  }

  const currencyCode = (currency || fallbackCurrency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "symbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safeAmount);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      currencyDisplay: "symbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safeAmount);
  }
}

/**
 * Get the currency symbol for a given currency code.
 *
 * @param currencyCode - ISO currency code (e.g., "USD", "EUR")
 * @returns Currency symbol (e.g., "$", "€")
 */
export function getCurrencySymbol(currencyCode: string = "USD"): string {
  const code = currencyCode.toUpperCase();
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).format(0);
    // Extract just the symbol (remove digits and whitespace)
    return formatted.replace(/[\d.,\s]/g, "").trim() || "$";
  } catch {
    return "$";
  }
}
