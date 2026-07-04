/**
 * Shared transactional email HTML/text templates.
 * Email-client safe: inline styles, table layout, absolute image URLs.
 */

import { ARREXIA_BRAND } from "@/lib/brand/assets";
import { getConfiguredAppUrl } from "@/lib/config/appUrl";

const NAVY = "#0f172a";
const BLUE = "#2563eb";
const BG = "#f8fafc";
const BORDER = "#e2e8f0";
const MUTED = "#64748b";
const SUBTLE = "#94a3b8";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MAX_WIDTH = 600;
const APP_DOMAIN = "arrexia.app";

/** @deprecated Use renderFooter() output instead. Kept for callers that reference the constant. */
export const PLATFORM_EMAIL_FOOTER = "Powered by Arrexia";

export type EmailBadge = "invoice" | "payment_reminder" | "test_email";

const BADGE_LABELS: Record<EmailBadge, string> = {
  invoice: "INVOICE",
  payment_reminder: "PAYMENT REMINDER",
  test_email: "TEST EMAIL",
};

const LEGACY_BRAND_PATTERN = /flowcollect/gi;
const LEADING_GREETING_PATTERN = /^\s*(dear|hi|hello)\s+[^\n,]+,?\s*\n+/i;
const TRAILING_CLOSING_PATTERN =
  /\n\s*(thank you|thanks|best regards|kind regards|sincerely|regards|yours truly),?\s*(?:\n[^\n]+)?\s*$/i;

export type SummaryRow = {
  label: string;
  value: string | null | undefined;
};

export type EmailShellOptions = {
  businessName: string;
  logoUrl?: string | null;
  badge: EmailBadge;
  greeting: string;
  mainMessage: string;
  summaryRows?: SummaryRow[];
  infoBoxNote?: string;
  ctaButton?: { label: string; url: string } | null;
};

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

/** Resolve relative asset paths to absolute URLs for email clients. */
export function resolveEmailImageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `${getConfiguredAppUrl()}${trimmed}`;
  }

  return null;
}

function getArrexiaEmailLogoUrl(): string {
  const dedicated = resolveEmailImageUrl("/brand/arrexia-logo-email.png");
  if (dedicated) return dedicated;

  return (
    resolveEmailImageUrl(ARREXIA_BRAND.logoLight) ??
    resolveEmailImageUrl(ARREXIA_BRAND.logoDark) ??
    `${getConfiguredAppUrl()}${ARREXIA_BRAND.logoLight}`
  );
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
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

export function renderEmailHeader(options: {
  businessName: string;
  logoUrl?: string | null;
}): string {
  const businessName = escapeHtml(options.businessName);
  const resolvedLogo = resolveEmailImageUrl(options.logoUrl);
  const initials = escapeHtml(deriveInitials(options.businessName));

  const avatarCell = resolvedLogo
    ? `<img src="${escapeHtml(resolvedLogo)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:contain;border:0;" />`
    : `<table role="presentation" width="48" height="48" cellspacing="0" cellpadding="0" style="width:48px;height:48px;border-radius:8px;background-color:#eff6ff;">
        <tr>
          <td align="center" valign="middle" style="width:48px;height:48px;border-radius:8px;font-size:16px;font-weight:700;color:${BLUE};line-height:48px;">
            ${initials}
          </td>
        </tr>
      </table>`;

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td width="48" valign="middle" style="width:48px;padding-right:16px;vertical-align:middle;">
          ${avatarCell}
        </td>
        <td valign="middle" style="vertical-align:middle;">
          <div style="font-size:30px;font-weight:700;color:${NAVY};line-height:1.2;letter-spacing:-0.02em;">
            ${businessName}
          </div>
        </td>
      </tr>
    </table>`;
}

export function renderEmailBadge(badge: EmailBadge): string {
  const label = escapeHtml(BADGE_LABELS[badge]);

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
      <tr>
        <td style="padding:6px 12px;border-radius:999px;background-color:#eff6ff;color:${BLUE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          ${label}
        </td>
      </tr>
    </table>`;
}

export function renderSummaryTable(rows: SummaryRow[]): string {
  const visible = rows.filter((row) => row.value != null && row.value !== "");
  if (visible.length === 0) return "";

  const rowsHtml = visible
    .map(
      (row, index) => `
        <tr>
          <td style="padding:12px 0;${index < visible.length - 1 ? `border-bottom:1px solid ${BORDER};` : ""}font-size:14px;color:${MUTED};width:44%;vertical-align:top;line-height:1.5;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:12px 0;${index < visible.length - 1 ? `border-bottom:1px solid ${BORDER};` : ""}font-size:14px;color:${NAVY};font-weight:600;text-align:right;vertical-align:top;line-height:1.5;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;border:1px solid ${BORDER};border-radius:12px;background-color:#ffffff;overflow:hidden;">
      <tr>
        <td style="padding:4px 20px 8px 20px;background-color:${BG};">
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

export function renderInfoBox(note: string | null | undefined): string {
  const trimmed = note?.trim();
  if (!trimmed) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;">
      <tr>
        <td style="padding:16px 18px;border:1px solid #dbeafe;border-left:4px solid ${BLUE};background-color:#eff6ff;border-radius:10px;font-size:14px;line-height:1.65;color:${NAVY};">
          ${escapeHtml(trimmed)}
        </td>
      </tr>
    </table>`;
}

/** Reusable CTA button — returns empty output when URL is missing or not public-safe. */
export function renderEmailButton(
  label: string,
  url: string | null | undefined
): { html: string; text: string } {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) {
    return { html: "", text: "" };
  }

  const safeUrl = escapeHtml(trimmedUrl);
  const safeLabel = escapeHtml(label);

  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;">
      <tr>
        <td align="left" bgcolor="${BLUE}" style="border-radius:8px;background-color:${BLUE};">
          <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 18px;font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${safeLabel}
          </a>
        </td>
      </tr>
    </table>`;

  return { html, text: `\n${label}: ${trimmedUrl}` };
}

export function renderSignature(businessName: string): { html: string; text: string } {
  const safeName = escapeHtml(businessName);

  return {
    html: `
      <p style="margin:32px 0 0 0;font-size:15px;line-height:1.6;color:#334155;">
        Thank you,<br />
        <span style="font-weight:600;color:${NAVY};">${safeName}</span>
      </p>`,
    text: `Thank you,\n${businessName}`,
  };
}

export function renderFooter(): { html: string; text: string } {
  const logoUrl = escapeHtml(getArrexiaEmailLogoUrl());
  const appUrl = escapeHtml(`https://${APP_DOMAIN}`);

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;border-top:1px solid ${BORDER};">
      <tr>
        <td align="center" style="padding:28px 24px 24px 24px;background-color:#fafbfc;">
          <p style="margin:0 0 12px 0;font-size:11px;line-height:1.4;color:${SUBTLE};letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
            Powered by
          </p>
          <img src="${logoUrl}" alt="Arrexia" width="120" style="display:block;width:120px;max-width:120px;height:auto;margin:0 auto 10px auto;border:0;" />
          <a href="${appUrl}" style="font-size:13px;line-height:1.5;color:${MUTED};text-decoration:none;font-weight:500;">
            ${APP_DOMAIN}
          </a>
        </td>
      </tr>
    </table>`;

  return {
    html,
    text: `Powered by Arrexia\n${APP_DOMAIN}`,
  };
}

export function renderEmailShell(options: EmailShellOptions): { html: string; text: string } {
  const badgeLabel = BADGE_LABELS[options.badge];
  const greeting = escapeHtml(options.greeting);
  const mainMessageHtml = plainMultilineToHtml(options.mainMessage);
  const summaryRows = options.summaryRows ?? [];
  const summaryHtml = renderSummaryTable(summaryRows);
  const infoBoxHtml = renderInfoBox(options.infoBoxNote);
  const button = renderEmailButton(
    options.ctaButton?.label ?? "View Invoice",
    options.ctaButton?.url
  );
  const signature = renderSignature(options.businessName);
  const footer = renderFooter();
  const header = renderEmailHeader({
    businessName: options.businessName,
    logoUrl: options.logoUrl,
  });
  const badge = renderEmailBadge(options.badge);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(badgeLabel)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${FONT};color:${NAVY};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${MAX_WIDTH}px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 28px 32px;border-bottom:1px solid ${BORDER};">
              ${header}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              ${badge}
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${NAVY};font-weight:500;">${greeting}</p>
              <p style="margin:0;font-size:15px;line-height:1.75;color:#334155;">${mainMessageHtml}</p>
              ${summaryHtml}
              ${infoBoxHtml}
              ${button.html}
              ${signature.html}
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              ${footer.html}
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
    badgeLabel,
    "",
    options.greeting,
    options.mainMessage,
    buildSummaryRowsText(summaryRows),
    options.infoBoxNote?.trim() ? `\n${options.infoBoxNote.trim()}` : "",
    button.text,
    signature.text,
    "",
    footer.text,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}

export type InvoiceEmailOptions = {
  businessName: string;
  logoUrl?: string | null;
  clientName: string;
  invoiceNumber: string;
  issueDate?: string | null;
  dueDate?: string | null;
  totalAmount: string;
  amountPaid?: string | null;
  outstandingAmount?: string | null;
  notes?: string | null;
  /** Optional public-safe invoice URL for future CTA support. */
  invoiceViewUrl?: string | null;
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
    logoUrl: options.logoUrl,
    badge: "invoice",
    greeting: `Dear ${options.clientName},`,
    mainMessage,
    summaryRows,
    infoBoxNote: "Please review the attached PDF invoice.",
    ctaButton: options.invoiceViewUrl
      ? { label: "View Invoice", url: options.invoiceViewUrl }
      : null,
  });

  return { ...rendered, subject };
}

export type ReminderEmailOptions = {
  businessName: string;
  logoUrl?: string | null;
  clientName: string;
  invoiceNumber: string;
  dueDate?: string | null;
  totalAmount?: string | null;
  outstandingAmount?: string | null;
  daysOverdue?: number | null;
  mainMessage?: string | null;
  /** Optional public-safe invoice URL for future CTA support. */
  invoiceViewUrl?: string | null;
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
    logoUrl: options.logoUrl,
    badge: "payment_reminder",
    greeting: `Hello ${options.clientName},`,
    mainMessage,
    summaryRows,
    infoBoxNote: "Please arrange payment at your earliest convenience.",
    ctaButton: options.invoiceViewUrl
      ? { label: "View Invoice", url: options.invoiceViewUrl }
      : null,
  });

  return { ...rendered, subject };
}

export type TestEmailOptions = {
  businessName: string;
  logoUrl?: string | null;
};

export function renderTestEmail(
  options: TestEmailOptions
): { html: string; text: string; subject: string } {
  const rendered = renderEmailShell({
    businessName: options.businessName,
    logoUrl: options.logoUrl,
    badge: "test_email",
    greeting: "Hello,",
    mainMessage:
      "This is a test email from your Arrexia workspace. If you received this message, email delivery is configured correctly.",
    infoBoxNote: "No action is required. You can continue sending invoices and reminders as usual.",
  });

  return {
    ...rendered,
    subject: "Arrexia email test",
  };
}
