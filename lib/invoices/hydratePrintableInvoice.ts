import { buildInvoiceBranding } from "@/app/[workspaceId]/invoices/_utils/branding";
import type { Database } from "@/types/supabase/index";
import { PAYMENT_TERMS_OPTIONS } from "@/lib/invoices/paymentTerms";
import type { PrintableInvoice } from "./invoice-pdf-shared";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];

type InvoiceMoneyRow = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string | null;
  notes: string | null;
  subtotal: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  tax_percent: number | null;
  tax_amount: number | null;
  amount: number | null;
  payment_terms?: string | null;
  payment_terms_days?: number | null;
};

type ClientRow = {
  name: string;
  email: string | null;
  company: string | null;
  country: string | null;
  whatsapp_phone: string | null;
  whatsapp: string | null;
};

type PaymentRow = {
  amount: number | null;
  status: string | null;
  archived_at?: string | null;
};

function coerceMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatPaymentTermsLabel(
  paymentTerms: string | null | undefined,
  paymentTermsDays: number | null | undefined
): string {
  if (!paymentTerms) return "—";
  const option = PAYMENT_TERMS_OPTIONS.find((o) => o.code === paymentTerms);
  if (paymentTerms === "custom" && paymentTermsDays != null) {
    return `Custom (${paymentTermsDays} days)`;
  }
  return option?.label ?? paymentTerms;
}

/** Fallback when invoices_view row is unavailable (e.g. archived invoice). */
export function sumCompletedPayments(payments: PaymentRow[]): number {
  return payments
    .filter((p) => !p.archived_at)
    .filter(
      (p) =>
        p.status === "completed" ||
        p.status === "paid" ||
        p.status == null ||
        p.status === ""
    )
    .reduce((sum, p) => sum + coerceMoney(p.amount), 0);
}

/**
 * Build a fully-hydrated PrintableInvoice for PDF rendering.
 * Financial paid/outstanding prefers invoices_view (same as invoice detail page).
 */
export function hydratePrintableInvoice(input: {
  invoice: InvoiceMoneyRow;
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
  }>;
  settings: SettingsRow | null;
  client: ClientRow | null | undefined;
  displayStatus?: string | null;
  /** When set, paid/outstanding come from invoices_view (authoritative). */
  invoiceView?: { paid?: number | null; outstanding?: number | null } | null;
  /** Used only when invoiceView is null (archived / missing view row). */
  payments?: PaymentRow[];
}): PrintableInvoice {
  const {
    invoice,
    items,
    settings,
    client,
    displayStatus,
    invoiceView,
    payments = [],
  } = input;

  const branding = buildInvoiceBranding(settings);
  const rawPhone = client?.whatsapp_phone || client?.whatsapp || null;
  const total = coerceMoney(invoice.amount);

  let amountPaid: number;
  let outstanding: number;
  if (invoiceView != null) {
    amountPaid = coerceMoney(invoiceView.paid);
    outstanding = coerceMoney(invoiceView.outstanding);
  } else {
    amountPaid = sumCompletedPayments(payments);
    outstanding = Math.max(total - amountPaid, 0);
  }

  const brandColor =
    (settings as { branding_primary_color?: string | null } | null)
      ?.branding_primary_color ?? null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    clientName: client?.name || "Client",
    clientEmail: client?.email || null,
    clientCompany: client?.company || null,
    clientPhone: rawPhone?.trim() || null,
    clientCountry: client?.country || null,
    currency: invoice.currency || branding.currencyCode,
    fallbackCurrency: branding.currencyCode,
    items,
    notes: invoice.notes || null,
    workspaceName: branding.fromName,
    workspaceEmail: branding.fromEmail || null,
    workspacePhone: branding.fromPhone || null,
    workspaceAddress: branding.addressLines.join("\n") || null,
    workspaceCountry: branding.fromCountry || null,
    workspaceCity: branding.fromCity || null,
    workspaceTaxId: branding.taxId || null,
    workspaceWebsite: branding.fromWebsite || null,
    logoUrl: branding.logoUrl,
    brandColor,
    thankYouMessage: branding.thankYou,
    paymentDetails: branding.hasAnyPaymentDetails ? branding.paymentDetails : null,
    subtotal: coerceMoney(invoice.subtotal),
    discountPercent: coerceMoney(invoice.discount_percent),
    discountAmount: coerceMoney(invoice.discount_amount),
    taxPercent: coerceMoney(invoice.tax_percent),
    taxAmount: coerceMoney(invoice.tax_amount),
    total,
    displayStatus: displayStatus || invoice.status,
    paymentTermsLabel: formatPaymentTermsLabel(
      invoice.payment_terms,
      invoice.payment_terms_days ?? null
    ),
    amountPaid,
    outstanding,
  };
}
