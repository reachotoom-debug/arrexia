/**
 * Formats enum-like values (snake_case, kebab-case) into human-readable labels.
 * 
 * Examples:
 * - "bank_transfer" → "Bank transfer"
 * - "cash" → "Cash"
 * - "pending_payment" → "Pending payment"
 * - "kebab-case" → "Kebab case"
 * - null/undefined/empty → "—"
 * 
 * @param value - Value in snake_case or kebab-case (e.g. "bank_transfer", "kebab-case")
 * @returns Human-readable label with first letter capitalized
 */
export function prettyLabel(value?: string | null): string {
  if (!value) return "—";
  const s = String(value).trim();
  if (!s) return "—";
  return s
    .replace(/[_-]+/g, " ")     // snake_case + kebab-case
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

