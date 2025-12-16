// lib/reminders/render.ts

interface InvoiceForRender {
  invoice_number?: string | null;
  due_date?: string | null;
  outstanding_amount?: number | null;
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

export function renderReminderTemplate({ template, invoice, client }: RenderArgs) {
  const replacements: Record<string, string> = {
    client_name: client?.name ?? "",
    invoice_number: invoice.invoice_number ?? "",
    due_date: invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString()
      : "",
    outstanding_amount:
      invoice.outstanding_amount != null
        ? String(invoice.outstanding_amount)
        : "",
    currency: invoice.currency ?? "",
    workspace_name: invoice.workspace_name ?? "",
  };

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
