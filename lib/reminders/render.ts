// lib/reminders/render.ts

import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { buildAppUrl } from "@/lib/config/appUrl";
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
  workspaceId?: string;
  invoiceId?: string;
  /** Workspace-local or rule occurrence reference date (YYYY-MM-DD). */
  referenceDate?: string | null;
  /** Precomputed overdue days; must match email shell when provided by send.ts. */
  daysOverdue?: number;
}): ReminderTemplateContext {
  const { invoiceView, client, workspaceId, invoiceId, referenceDate, daysOverdue } =
    args;

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
    if (!currency) return String(outstanding);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(outstanding);
    } catch {
      return String(outstanding);
    }
  })();

  const resolvedDaysOverdue =
    daysOverdue ??
    computeReminderDaysOverdue({
      dueDate,
      referenceDate: referenceDate ?? null,
    });

  const paymentLink =
    workspaceId && invoiceId
      ? buildAppUrl(`/${workspaceId}/invoices/${invoiceId}`)
      : "";

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
    payment_link: paymentLink,
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

  const interpolate = (input: string) =>
    input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (key in replacements) return replacements[key] ?? "";
      return "";
    });

  return {
    subject: interpolate(template.subject),
    html: interpolate(template.body),
  };
}

// Backward-compatible renderer
export function renderReminderTemplate({ template, invoice, client }: RenderArgs) {
  const context = buildReminderTemplateContext({ invoiceView: invoice, client });
  return renderReminderTemplateFromContext({ template, context });
}
