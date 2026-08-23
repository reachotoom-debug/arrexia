// lib/reminders/render.ts

import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { formatCurrency } from "@/lib/format/currency";
import { upgradeLegacyCanonicalReminderCopy } from "./canonicalDefaults";
import { computeReminderDaysOverdue } from "./calendarOverdue";

interface InvoiceForRender {
  invoice_number?: string | null;
  due_date?: string | null;
  outstanding?: number | null; // From invoices_view.outstanding
  currency?: string | null;
  workspace_name?: string | null;
}

type RenderArgs = {
  template: {
    id: string;
    subject: string;
    body: string;
  };
  invoice: InvoiceForRender;
  client: { name?: string | null; email?: string | null } | null;
};

export type ReminderTemplateContext = {
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  dueDate: string | null;
  dueDateFormatted: string;
  outstanding: number | null;
  outstandingFormatted: string;
  currency: string;
  workspaceName: string;
  daysOverdue: number;
  replacements: Record<string, string>;
};

export function buildReminderTemplateContext(args: {
  invoiceView: InvoiceForRender;
  client: { name?: string | null; email?: string | null } | null;
  /** Public customer-safe invoice URL (/i/{token}). Required for link template variables. */
  publicInvoiceUrl?: string | null;
  /** Precomputed overdue days; must match email shell when provided by send.ts. */
  referenceDate?: string | null;
  daysOverdue?: number;
}): ReminderTemplateContext {
  const { invoiceView, client, publicInvoiceUrl, referenceDate, daysOverdue } = args;

  const clientName = client?.name ?? "";
  const clientEmail = client?.email ?? "";
  const invoiceNumber = invoiceView.invoice_number ?? "";
  const dueDate = invoiceView.due_date ?? null;
  const currency = invoiceView.currency ?? "";
  const workspaceName = invoiceView.workspace_name ?? "";

  const dueDateFormatted = dueDate ? formatDateOnlyField(dueDate) : "";

  const outstanding =
    invoiceView.outstanding == null ? null : Number(invoiceView.outstanding);

  const outstandingFormatted = (() => {
    if (outstanding == null) return "";
    return formatCurrency(outstanding, { currency: currency || "USD" });
  })();

  const resolvedDaysOverdue =
    daysOverdue ??
    computeReminderDaysOverdue({
      dueDate,
      referenceDate: referenceDate ?? null,
    });

  // Legacy {{payment_link}} alias: previously pointed at authenticated workspace URLs.
  // Now resolves to the public invoice URL for backward compatibility with saved templates.
  const publicLink = publicInvoiceUrl?.trim() ?? "";

  const replacements: Record<string, string> = {
    client_name: clientName,
    invoice_number: invoiceNumber,
    due_date: dueDateFormatted,
    due_date_formatted: dueDateFormatted,
    // Numeric + formatted variants (support legacy keys used in seeded templates)
    outstanding_amount: outstanding == null ? "" : String(outstanding),
    outstanding_formatted: outstandingFormatted,
    amount_due: outstandingFormatted || (outstanding == null ? "" : String(outstanding)),
    currency: currency,
    workspace_name: workspaceName,
    days_overdue: String(resolvedDaysOverdue),
    payment_link: publicLink,
    invoice_link: publicLink,
    view_invoice_link: publicLink,
  };

  return {
    clientName,
    clientEmail,
    invoiceNumber,
    dueDate,
    dueDateFormatted,
    outstanding,
    outstandingFormatted,
    currency,
    workspaceName,
    daysOverdue: resolvedDaysOverdue,
    replacements,
  };
}

export function renderReminderTemplateFromContext(args: {
  template: { id: string; subject: string; body: string };
  context: ReminderTemplateContext;
}) {
  const { template, context } = args;
  const replacements = context.replacements;

  const subject = upgradeLegacyCanonicalReminderCopy(template.subject);
  const body = upgradeLegacyCanonicalReminderCopy(template.body);

  const interpolate = (input: string) =>
    input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (key in replacements) return replacements[key] ?? "";
      return "";
    });

  return {
    subject: interpolate(subject),
    html: interpolate(body),
  };
}

// Backward-compatible renderer
export function renderReminderTemplate({ template, invoice, client }: RenderArgs) {
  const context = buildReminderTemplateContext({ invoiceView: invoice, client });
  return renderReminderTemplateFromContext({ template, context });
}
