/**
 * Display-only coercion for monetary values from DB/API (numeric/string).
 * Preserves fractional cents for Intl formatting — does not round or truncate.
 */
export function coerceMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const s = String(value).trim();
  if (s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
