import { buildInvoiceBranding } from "@/app/[workspaceId]/invoices/_utils/branding";
import { formatPaymentTermsLabel } from "@/lib/invoices/hydratePrintableInvoice";
import { resolvePaymentInstructionLines } from "@/lib/invoices/invoiceDisplay";
import {
  assertPublicInvoiceDtoShape,
  type PublicInvoiceDto,
  type PublicInvoiceLineItem,
} from "@/lib/invoices/publicInvoiceDto";
import {
  PUBLIC_INVOICE_CLIENT_SELECT,
  PUBLIC_INVOICE_ITEM_SELECT,
  PUBLIC_INVOICE_SETTINGS_SELECT,
  type PublicInvoiceSettingsRow,
  PUBLIC_INVOICE_VIEW_SELECT,
} from "@/lib/invoices/publicInvoiceSettingsSelect";
import { isValidPublicInvoiceTokenFormat } from "@/lib/invoices/publicInvoiceUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

type InvoiceViewFinancialRow = {
  display_status: string | null;
  paid: number | null;
  outstanding: number | null;
  is_overdue: boolean | null;
  overdue_days: number | null;
  currency: string | null;
};

type InvoiceItemRow = {
  name: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
};

type ClientRow = {
  name: string;
  company: string | null;
};

function coerceMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logLoaderFailClosed(context: string): void {
  console.error("[loadPublicInvoiceByToken] fail closed", { context });
}

function isInvoiceViewFinancialRow(value: unknown): value is InvoiceViewFinancialRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    "paid" in row &&
    "outstanding" in row &&
    "display_status" in row &&
    "currency" in row
  );
}

function isInvoiceItemRow(value: unknown): value is InvoiceItemRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && "quantity" in row && "unit_price" in row;
}

function isClientRow(value: unknown): value is ClientRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === "string";
}

function parseInvoiceItemRows(items: unknown): InvoiceItemRow[] | null {
  if (!Array.isArray(items)) return null;
  if (!items.every(isInvoiceItemRow)) return null;
  return items;
}

function parseSettingsRow(value: unknown): PublicInvoiceSettingsRow | null {
  if (value == null) return null;
  if (typeof value !== "object") return null;
  return value as PublicInvoiceSettingsRow;
}

function mapLineItems(items: InvoiceItemRow[]): PublicInvoiceLineItem[] {
  return items.map((item) => {
    const quantity = coerceMoney(item.quantity);
    const unitPrice = coerceMoney(item.unit_price);
    const lineTotal =
      item.line_total != null ? coerceMoney(item.line_total) : quantity * unitPrice;
    return {
      name: item.name,
      description: item.description,
      quantity,
      unitPrice,
      lineTotal,
    };
  });
}

export type LoadPublicInvoiceResult =
  | { ok: true; invoice: PublicInvoiceDto }
  | { ok: false; reason: "invalid_token" | "not_found" };

/**
 * Dedicated server-only loader for unauthenticated public invoice viewing.
 * Uses service role; never exposes raw DB rows to UI.
 */
export async function loadPublicInvoiceByToken(
  token: string
): Promise<LoadPublicInvoiceResult> {
  if (!isValidPublicInvoiceTokenFormat(token)) {
    return { ok: false, reason: "invalid_token" };
  }

  const admin = supabaseAdmin();

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select(
      "id, workspace_id, status, archived_at, invoice_number, issue_date, due_date, currency, notes, subtotal, discount_percent, discount_amount, tax_percent, tax_amount, amount, payment_terms, payment_terms_days, client_id"
    )
    .eq("public_access_token", token)
    .maybeSingle();

  if (invoiceError || !invoice) {
    if (invoiceError) {
      logLoaderFailClosed("invoice_lookup_failed");
    }
    return { ok: false, reason: "not_found" };
  }

  if (invoice.archived_at) {
    return { ok: false, reason: "not_found" };
  }

  if (invoice.status === "draft") {
    return { ok: false, reason: "not_found" };
  }

  const { data: invoiceView, error: invoiceViewError } = await admin
    .from("invoices_view")
    .select(PUBLIC_INVOICE_VIEW_SELECT)
    .eq("id", invoice.id)
    .maybeSingle();

  if (invoiceViewError) {
    logLoaderFailClosed("invoices_view_query_failed");
    return { ok: false, reason: "not_found" };
  }

  if (!invoiceView) {
    logLoaderFailClosed("invoices_view_row_missing");
    return { ok: false, reason: "not_found" };
  }

  if (!isInvoiceViewFinancialRow(invoiceView)) {
    logLoaderFailClosed("invoices_view_row_invalid");
    return { ok: false, reason: "not_found" };
  }

  const view = invoiceView;

  const { data: items, error: itemsError } = await admin
    .from("invoice_items")
    .select(PUBLIC_INVOICE_ITEM_SELECT)
    .eq("invoice_id", invoice.id)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (itemsError) {
    logLoaderFailClosed("invoice_items_query_failed");
    return { ok: false, reason: "not_found" };
  }

  const parsedItems = parseInvoiceItemRows(items);
  if (!parsedItems) {
    logLoaderFailClosed("invoice_items_row_invalid");
    return { ok: false, reason: "not_found" };
  }

  let client: ClientRow | null = null;
  if (invoice.client_id) {
    const { data: clientRow, error: clientError } = await admin
      .from("clients")
      .select(PUBLIC_INVOICE_CLIENT_SELECT)
      .eq("id", invoice.client_id)
      .eq("workspace_id", invoice.workspace_id)
      .maybeSingle();

    if (clientError) {
      logLoaderFailClosed("client_query_failed");
      return { ok: false, reason: "not_found" };
    }

    if (!clientRow) {
      logLoaderFailClosed("client_row_missing");
      return { ok: false, reason: "not_found" };
    }

    if (!isClientRow(clientRow)) {
      logLoaderFailClosed("client_row_invalid");
      return { ok: false, reason: "not_found" };
    }

    client = clientRow;
  }

  const { data: settings, error: settingsError } = await admin
    .from("settings")
    .select(PUBLIC_INVOICE_SETTINGS_SELECT)
    .eq("workspace_id", invoice.workspace_id)
    .maybeSingle();

  if (settingsError) {
    logLoaderFailClosed("settings_query_failed");
    return { ok: false, reason: "not_found" };
  }

  const brandingSettings = parseSettingsRow(settings);
  if (settings != null && brandingSettings == null) {
    logLoaderFailClosed("settings_row_invalid");
    return { ok: false, reason: "not_found" };
  }

  const branding = buildInvoiceBranding(brandingSettings);
  const currency =
    view.currency?.trim() ||
    invoice.currency?.trim() ||
    branding.currencyCode ||
    "USD";

  const total = coerceMoney(invoice.amount);
  const amountPaid = coerceMoney(view.paid);
  const outstanding = coerceMoney(view.outstanding);
  const displayStatus =
    view.display_status?.trim() ||
    (invoice.status === "void" ? "void" : invoice.status);

  const paymentDetails = branding.hasAnyPaymentDetails ? branding.paymentDetails : null;
  const paymentInstructionLines = resolvePaymentInstructionLines(
    branding.paymentDetails.otherInstructions,
    branding.hasAnyPaymentDetails
  );

  const dto: PublicInvoiceDto = {
    company: {
      name: branding.fromName,
      logoUrl: branding.logoUrl,
      addressLines: branding.addressLines,
      taxId: branding.taxId || null,
      email: branding.fromEmail || null,
      phone: branding.fromPhone || null,
      website: branding.fromWebsite || null,
      city: branding.fromCity || null,
      country: branding.fromCountry || null,
    },
    client: {
      name: client?.name?.trim() || "Client",
      company: client?.company?.trim() || null,
    },
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    paymentTermsLabel: formatPaymentTermsLabel(
      invoice.payment_terms,
      invoice.payment_terms_days
    ),
    currency,
    lineItems: mapLineItems(parsedItems),
    financials: {
      subtotal: coerceMoney(invoice.subtotal),
      discountPercent: coerceMoney(invoice.discount_percent),
      discountAmount: coerceMoney(invoice.discount_amount),
      taxPercent: coerceMoney(invoice.tax_percent),
      taxAmount: coerceMoney(invoice.tax_amount),
      total,
      amountPaid,
      outstanding,
      currency,
    },
    displayStatus,
    overdueDays: view.overdue_days != null ? Number(view.overdue_days) : null,
    notes: invoice.notes?.trim() || null,
    paymentInstructionLines,
    paymentDetails: paymentDetails
      ? {
          bankName: paymentDetails.bankName || null,
          bankAccountName: paymentDetails.bankAccountName || null,
          bankAccountNumber: paymentDetails.bankAccountNumber || null,
          bankSwift: paymentDetails.bankSwift || null,
          bankIban: paymentDetails.bankIban || null,
          paypalHandle: paymentDetails.paypalHandle || null,
          stripeDescriptor: paymentDetails.stripeDescriptor || null,
          otherInstructions: paymentDetails.otherInstructions || null,
        }
      : null,
    thankYouNote: branding.thankYou,
    payInvoiceAvailable: false,
  };

  assertPublicInvoiceDtoShape(dto);
  return { ok: true, invoice: dto };
}
