/**
 * Types for server-side invoice PDF generation (@react-pdf/renderer).
 * Pure display helpers live in invoiceDisplay.ts (safe for page/UI imports).
 */

export type { InvoiceDueStatusVariant } from "./invoiceDisplay";
export {
  PDF_DEFAULT_PAYMENT_INSTRUCTION,
  PDF_DEFAULT_THANK_YOU,
  buildHeaderContactLine,
  companyInitials,
  dueDateDiffDays,
  formatAddressLines,
  formatInvoiceDate,
  formatPdfFromLocationLine,
  getInvoiceDueStatus,
  isLegacyPaymentInstruction,
  isLegacyThankYou,
  parseBrandColorHex,
  resolvePaymentInstructionLines,
  resolveThankYouBody,
  shouldShowDueTiming,
} from "./invoiceDisplay";

export interface PrintableInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientEmail?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientCountry?: string | null;
  currency: string;
  fallbackCurrency?: string | null;
  items: {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
  }[];
  notes?: string | null;
  workspaceName?: string;
  workspaceEmail?: string | null;
  workspacePhone?: string | null;
  workspaceAddress?: string | null;
  /** Settings `business_city` — PDF FROM location only (with workspaceCountry). */
  workspaceCity?: string | null;
  /** Settings `business_country` — PDF FROM location only (with workspaceCity). */
  workspaceCountry?: string | null;
  workspaceTaxId?: string | null;
  workspaceWebsite?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  thankYouMessage?: string | null;
  paymentDetails?: {
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankSwift?: string | null;
    bankIban?: string | null;
    paypalHandle?: string | null;
    stripeDescriptor?: string | null;
    otherInstructions?: string | null;
  } | null;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  /** Canonical status from invoices_view.display_status */
  displayStatus?: string | null;
  paymentTermsLabel?: string | null;
  amountPaid?: number;
  outstanding?: number;
}

/** @deprecated Display-only — do not mutate stored values. Use warnings instead. */
export function applyBasicPaymentInstructionFixes(text: string): string {
  return text;
}
