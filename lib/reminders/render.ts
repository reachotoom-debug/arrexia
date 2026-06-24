// lib/reminders/render.ts

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
  now?: Date;
}): ReminderTemplateContext {
  const { invoiceView, client, now = new Date() } = args;

  const clientName = client?.name ?? "";
  const clientEmail = client?.email ?? "";
  const invoiceNumber = invoiceView.invoice_number ?? "";
  const dueDate = invoiceView.due_date ?? null;
  const currency = invoiceView.currency ?? "";
  const workspaceName = invoiceView.workspace_name ?? "";

  const dueDateFormatted = dueDate ? new Date(dueDate).toLocaleDateString() : "";

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

  const daysOverdue = (() => {
    if (!dueDate) return 0;
    const msPerDay = 1000 * 60 * 60 * 24;
    const due = new Date(dueDate);
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const t = new Date(now);
    const startOfNow = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const diffDays = Math.floor((startOfNow.getTime() - startOfDue.getTime()) / msPerDay);
    return diffDays > 0 ? diffDays : 0;
  })();

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
    days_overdue: String(daysOverdue),
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
    daysOverdue,
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
