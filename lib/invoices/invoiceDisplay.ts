/**
 * Pure invoice display helpers (no @react-pdf/renderer).
 * Safe for invoice detail page, branding utils, and settings UI.
 */

export function isLegacyPaymentInstruction(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) return false;
  const legacyPatterns = [
    /^this is your last reminder\.?$/i,
    /^this is you last reminder\.?$/i,
    /^your last reminder\.?$/i,
    /^you last reminder\.?$/i,
    /^please complete your payment details above\.?$/i,
  ];
  return legacyPatterns.some((re) => re.test(trimmed));
}

export function isLegacyThankYou(text: string): boolean {
  return (
    text.trim().toLowerCase() ===
    "thank you for your business, please send me your due invoice to my account"
  );
}

export const PDF_DEFAULT_THANK_YOU =
  "Thank you for your business. Please complete payment by the due date using the payment details above.";

export const PDF_DEFAULT_PAYMENT_INSTRUCTION =
  "Please complete payment using the payment details above.";

export function formatAddressLines(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolvePaymentInstructionLines(
  otherInstructions: string | null | undefined,
  hasStructuredPaymentDetails: boolean
): string[] {
  const custom = otherInstructions?.trim();
  if (custom && !isLegacyPaymentInstruction(custom)) {
    return custom
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (hasStructuredPaymentDetails) {
    return [PDF_DEFAULT_PAYMENT_INSTRUCTION];
  }
  return [];
}

export function shouldShowDueTiming(
  displayStatus: string | null | undefined
): boolean {
  const status = (displayStatus || "").toLowerCase();
  return status === "sent" || status === "overdue" || status === "partially_paid";
}

export function dueDateDiffDays(dueDateIso: string): number {
  const due = new Date(dueDateIso);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

export type InvoiceDueStatusVariant = "overdue" | "soon";

export function getInvoiceDueStatus(dueDateIso: string): {
  line: string;
  variant: InvoiceDueStatusVariant;
  bold: boolean;
} {
  const diff = dueDateDiffDays(dueDateIso);
  if (diff < 0) {
    const n = Math.abs(diff);
    return {
      line: n === 1 ? "1 day overdue" : `${n} days overdue`,
      variant: "overdue",
      bold: true,
    };
  }
  if (diff === 0) {
    return { line: "Due today", variant: "soon", bold: false };
  }
  if (diff === 1) {
    return { line: "Due in 1 day", variant: "soon", bold: false };
  }
  return { line: `Due in ${diff} days`, variant: "soon", bold: false };
}

export function formatInvoiceDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function resolveThankYouBody(
  thankYouMessage: string | null | undefined
): string {
  const thankYouRaw = thankYouMessage?.trim();
  if (thankYouRaw && thankYouRaw.length > 0 && !isLegacyThankYou(thankYouRaw)) {
    return thankYouRaw;
  }
  return PDF_DEFAULT_THANK_YOU;
}

export function formatPdfFromLocationLine(
  city?: string | null,
  country?: string | null
): string | null {
  const ci = city?.trim() ?? "";
  const c = country?.trim() ?? "";
  if (ci && c) return `${c} - ${ci}`;
  return null;
}

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

export function parseBrandColorHex(hex?: string | null): string {
  if (!hex?.trim()) return "#f5c518";
  const m = hex.trim().match(HEX_COLOR);
  if (!m) return "#f5c518";
  return `#${m[1]!.toLowerCase()}`;
}

export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "FC";
}

export function buildHeaderContactLine(
  email?: string | null,
  phone?: string | null
): string | null {
  const parts = [email?.trim(), phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
