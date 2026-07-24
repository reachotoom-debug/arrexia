import { addCalendarDays } from "@/lib/reminders/ruleTrigger";

export type PaymentTermsCode =
  | "due_on_receipt"
  | "net_7"
  | "net_15"
  | "net_30"
  | "net_45"
  | "net_60"
  | "custom";

// Alias for backward compatibility
export type PaymentTerms = PaymentTermsCode;

export const PAYMENT_TERMS_OPTIONS: Array<{ code: PaymentTermsCode; label: string; days: number }> = [
  { code: "due_on_receipt", label: "Due on receipt", days: 0 },
  { code: "net_7", label: "Net 7", days: 7 },
  { code: "net_15", label: "Net 15", days: 15 },
  { code: "net_30", label: "Net 30", days: 30 },
  { code: "net_45", label: "Net 45", days: 45 },
  { code: "net_60", label: "Net 60", days: 60 },
  { code: "custom", label: "Custom", days: 0 },
];

/**
 * Derives the number of days from payment terms (backward compatible)
 * @deprecated Use resolvePaymentTermsDays for better fallback logic
 */
export function deriveDaysFromTerms(
  paymentTerms: PaymentTermsCode,
  customDays?: number
): number {
  switch (paymentTerms) {
    case "net_7":
      return 7;
    case "net_15":
      return 15;
    case "net_30":
      return 30;
    case "net_45":
      return 45;
    case "net_60":
      return 60;
    case "due_on_receipt":
      return 0;
    case "custom":
      return customDays ?? 0;
    default:
      return 0;
  }
}

/**
 * Resolves effective payment terms days with fallback logic
 * Priority: explicitDays > termsCode mapping > clientDefault > workspaceDefault > 0
 */
export function resolvePaymentTermsDays(
  termsCode: PaymentTermsCode | null | undefined,
  explicitDays: number | null | undefined,
  clientDefaultDays?: number | null,
  workspaceDefaultDays?: number | null
): number {
  // 1) If explicitDays is provided and > 0 → use it
  if (explicitDays != null && explicitDays > 0) {
    return explicitDays;
  }

  // 2) If termsCode is one of our presets → use mapped days
  if (termsCode && termsCode !== "custom") {
    const found = PAYMENT_TERMS_OPTIONS.find((opt) => opt.code === termsCode);
    if (found) return found.days;
  }

  // 3) Fallback to client default
  if (clientDefaultDays != null && clientDefaultDays >= 0) {
    return clientDefaultDays;
  }

  // 4) Fallback to workspace default
  if (workspaceDefaultDays != null && workspaceDefaultDays >= 0) {
    return workspaceDefaultDays;
  }

  // 5) Final fallback: 0 days
  return 0;
}

/**
 * Computes due date from issue date and number of days (null-safe)
 * @param issueDateISO - Date string in YYYY-MM-DD format (can be null/undefined)
 * @param days - Number of days to add (can be null/undefined)
 * @returns Date string in YYYY-MM-DD format, or null if invalid
 */
export function computeDueDate(
  issueDateISO: string | null | undefined,
  days: number | null | undefined
): string | null {
  if (!issueDateISO) {
    return null;
  }

  const offset = typeof days === "number" && Number.isFinite(days) ? days : 0;
  return addCalendarDays(issueDateISO, offset);
}

/**
 * Calculates due date from issue date and payment terms (backward compatible, null-safe)
 * @deprecated Use computeDueDate with resolvePaymentTermsDays for better control
 */
export function calculateDueDate(
  issueDate: string | null | undefined,
  paymentTerms: PaymentTermsCode | null | undefined,
  customDays?: number | null
): string | null {
  if (!issueDate || !paymentTerms) {
    return null;
  }

  const days = deriveDaysFromTerms(paymentTerms, customDays ?? undefined);
  return computeDueDate(issueDate, days);
}

