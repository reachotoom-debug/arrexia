/**
 * Shared transactional email HTML/text templates.
 * Email-client safe: inline styles, no external CSS/images.
 */

const NAVY = "#0f172a";
const BLUE = "#2563eb";
const BG = "#f8fafc";
const BORDER = "#e2e8f0";
const MUTED = "#64748b";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const PLATFORM_EMAIL_FOOTER = "Powered by Arrexia";

const LEGACY_BRAND_PATTERN = /flowcollect/gi;
const LEADING_GREETING_PATTERN = /^\s*(dear|hi|hello)\s+[^\n,]+,?\s*\n+/i;
const TRAILING_CLOSING_PATTERN =
  /\n\s*(thank you|thanks|best regards|kind regards|sincerely|regards|yours truly),?\s*(?:\n[^\n]+)?\s*$/i;

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainMultilineToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
}

function formatDisplayDatePlain(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDisplayDate(value: string | null | undefined): string {
  return escapeHtml(formatDisplayDatePlain(value));
}

/** Strip legacy branding, greetings, and sign-offs from template body before the HTML shell wraps it. */
export function sanitizeReminderMainMessage(message: string): string {
  let text = message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n");

  text = text.replace(LEGACY_BRAND_PATTERN, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  text = text.replace(LEADING_GREETING_PATTERN, "");
  text = text.replace(TRAILING_CLOSING_PATTERN, "");

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

type SummaryRow = {
  label: string;
  value: string | null | undefined;
};

export type EmailShellOptions = {
  businessName: string;
  badge: string;
  greeting: string;
  mainMessage: string;
  summaryRows: SummaryRow[];
  ctaNote: string;
  signatureLine: string;
  includeBusinessNameInSignature?: boolean;
  platformFooter?: string;
};

function buildSummaryRowsHtml(rows: SummaryRow[]): string {
  const visible = rows.filter((row) => row.value != null && row.value !== "");
  if (visible.length === 0) return "";

  const rowsHtml = visible
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${MUTED};width:42%;vertical-align:top;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${NAVY};font-weight:600;text-align:right;vertical-align:top;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0 0;border:1px solid ${BORDER};border-radius:8px;background-color:${BG};">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    </table>`;
}

function buildSummaryRowsText(rows: SummaryRow[]): string {
  const visible = rows.filter((row) => row.value != null && row.value !== "");
  if (visible.length === 0) return "";
  return `\n\n${visible.map((row) => `${row.label}: ${row.value}`).join("\n")}`;
}

export function renderEmailShell(options: EmailShellOptions): { html: string; text: string } {
  const businessName = escapeHtml(options.businessName);
  const badge = escapeHtml(options.badge);
  const greeting = escapeHtml(options.greeting);
  const mainMessageHtml = plainMultilineToHtml(options.mainMessage);
  const ctaNote = escapeHtml(options.ctaNote);
  const platformFooter = escapeHtml(options.platformFooter ?? PLATFORM_EMAIL_FOOTER);
  const summaryHtml = buildSummaryRowsHtml(options.summaryRows);

  const signatureHtml = options.includeBusinessNameInSignature
    ? `${escapeHtml(options.signatureLine)}<br />${businessName}`
    : escapeHtml(options.signatureLine);

  const signatureText = options.includeBusinessNameInSignature
    ? `${options.signatureLine}\n${options.businessName}`
    : options.signatureLine;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${badge}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${FONT};color:${NAVY};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px 28px;border-bottom:1px solid ${BORDER};">
              <div style="font-size:22px;font-weight:700;color:${NAVY};line-height:1.3;">${businessName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px 28px;">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background-color:#eff6ff;color:${BLUE};font-size:12px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;">
                ${badge}
              </div>
              <p style="margin:20px 0 12px 0;font-size:16px;line-height:1.6;color:${NAVY};">${greeting}</p>
              <p style="margin:0 0 0 0;font-size:15px;line-height:1.7;color:#334155;">${mainMessageHtml}</p>
              ${summaryHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0 0;">
                <tr>
                  <td style="padding:14px 16px;border-left:4px solid ${BLUE};background-color:#eff6ff;border-radius:6px;font-size:14px;line-height:1.6;color:${NAVY};">
                    ${ctaNote}
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0 0;font-size:14px;line-height:1.6;color:#334155;">${signatureHtml}</p>
              <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${platformFooter}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    options.businessName,
    options.badge,
    "",
    options.greeting,
    options.mainMessage,
    buildSummaryRowsText(options.summaryRows),
    "",
    options.ctaNote,
    "",
    signatureText,
    options.platformFooter ?? PLATFORM_EMAIL_FOOTER,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}

export type InvoiceEmailOptions = {
  businessName: string;
  clientName: string;
  invoiceNumber: string;
  issueDate?: string | null;
  dueDate?: string | null;
  totalAmount: string;
  amountPaid?: string | null;
  outstandingAmount?: string | null;
  notes?: string | null;
};

export function renderInvoiceEmail(
  options: InvoiceEmailOptions
): { html: string; text: string; subject: string } {
  const subject = `Invoice #${options.invoiceNumber} from ${options.businessName}`;
  const summaryRows: SummaryRow[] = [
    { label: "Invoice number", value: options.invoiceNumber },
    { label: "Issue date", value: formatDisplayDate(options.issueDate) },
    { label: "Due date", value: formatDisplayDate(options.dueDate) },
    { label: "Total amount", value: options.totalAmount },
  ];

  if (options.amountPaid != null && options.amountPaid !== "") {
    summaryRows.push({ label: "Amount paid", value: options.amountPaid });
  }
  if (options.outstandingAmount != null && options.outstandingAmount !== "") {
    summaryRows.push({ label: "Outstanding amount", value: options.outstandingAmount });
  }

  let mainMessage = `Please find attached invoice #${options.invoiceNumber}.`;
  if (options.notes?.trim()) {
    mainMessage += `\n\n${options.notes.trim()}`;
  }

  const rendered = renderEmailShell({
    businessName: options.businessName,
    badge: "Invoice",
    greeting: `Dear ${options.clientName},`,
    mainMessage,
    summaryRows,
    ctaNote: "Please review the attached PDF invoice.",
    signatureLine: "Thank you for your business.",
    includeBusinessNameInSignature: false,
    platformFooter: PLATFORM_EMAIL_FOOTER,
  });

  return { ...rendered, subject };
}

export type ReminderEmailOptions = {
  businessName: string;
  clientName: string;
  invoiceNumber: string;
  dueDate?: string | null;
  totalAmount?: string | null;
  outstandingAmount?: string | null;
  daysOverdue?: number | null;
  mainMessage?: string | null;
};

function buildDefaultReminderMainMessage(options: ReminderEmailOptions): string {
  const amount = options.outstandingAmount || options.totalAmount;
  const dueDate = formatDisplayDatePlain(options.dueDate);

  let message = `This is a friendly reminder that invoice #${options.invoiceNumber}`;
  if (amount) {
    message += ` for ${amount}`;
  }
  message += ` was due on ${dueDate}`;
  if (options.daysOverdue != null && options.daysOverdue > 0) {
    message += ` (${options.daysOverdue} day${options.daysOverdue === 1 ? "" : "s"} ago)`;
  }
  message += ".";
  message += "\n\nIf you already made the payment, please ignore this message.";

  return message;
}

export function renderReminderEmail(
  options: ReminderEmailOptions
): { html: string; text: string; subject: string } {
  const subject = `Payment reminder: Invoice #${options.invoiceNumber}`;
  const rawMainMessage = options.mainMessage?.trim() || buildDefaultReminderMainMessage(options);
  const mainMessage = sanitizeReminderMainMessage(rawMainMessage);

  const summaryRows: SummaryRow[] = [
    { label: "Invoice number", value: options.invoiceNumber },
    { label: "Due date", value: formatDisplayDate(options.dueDate) },
  ];

  if (options.totalAmount != null && options.totalAmount !== "") {
    summaryRows.push({ label: "Total amount", value: options.totalAmount });
  }
  if (options.outstandingAmount != null && options.outstandingAmount !== "") {
    summaryRows.push({ label: "Outstanding amount", value: options.outstandingAmount });
  }
  if (options.daysOverdue != null && options.daysOverdue > 0) {
    summaryRows.push({
      label: "Days overdue",
      value: String(options.daysOverdue),
    });
  }

  const rendered = renderEmailShell({
    businessName: options.businessName,
    badge: "Payment reminder",
    greeting: `Hello ${options.clientName},`,
    mainMessage,
    summaryRows,
    ctaNote: "Please arrange payment at your earliest convenience.",
    signatureLine: "Thank you,",
    includeBusinessNameInSignature: true,
    platformFooter: PLATFORM_EMAIL_FOOTER,
  });

  return { ...rendered, subject };
}
