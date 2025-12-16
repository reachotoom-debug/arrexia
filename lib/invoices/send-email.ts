/**
 * Invoice email sending helper
 * Reuses SMTP configuration from workspace_email_settings and nodemailer transport
 * 
 * TODO: Future enhancements:
 * - Support multiple recipients (BCC, CC)
 * - Custom email templates (similar to reminder templates)
 * - WhatsApp delivery option
 * - Delivery status webhooks from email provider
 * - Retry mechanism for failed sends
 */

import { supabaseServer } from "@/lib/supabase/server";
import { generateInvoicePdf, type PrintableInvoice } from "./pdf";
import type { Database } from "@/types/supabase";

// Dynamic import for nodemailer
let nodemailer: typeof import("nodemailer");

type WorkspaceEmailSettingsRow = Database["public"]["Tables"]["workspace_email_settings"]["Row"];

export interface SendInvoiceEmailResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
  subject?: string;
  bodyPreview?: string;
}

/**
 * Send an invoice by email with PDF attachment
 * 
 * @param options - Send options including workspaceId, invoiceId, and recipient email
 * @returns Result object with success status, message ID, and error details
 */
export async function sendInvoiceEmail(options: {
  workspaceId: string;
  invoiceId: string;
  toEmail: string;
}): Promise<SendInvoiceEmailResult> {
  const { workspaceId, invoiceId, toEmail } = options;
  const supabase = await supabaseServer();

  // Dynamically import nodemailer
  try {
    nodemailer = await import("nodemailer");
  } catch (importError) {
    return {
      success: false,
      errorMessage: "nodemailer package is not installed. Please install it with: npm install nodemailer @types/nodemailer",
    };
  }

  // 1) Load invoice data (from invoices_view or base table)
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(`
      id,
      workspace_id,
      invoice_number,
      issue_date,
      due_date,
      currency,
      notes,
      subtotal,
      discount_percent,
      discount_amount,
      tax_percent,
      tax_amount,
      amount,
      clients (
        id,
        name,
        email,
        company
      )
    `)
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    return {
      success: false,
      errorMessage: `Invoice not found: ${invoiceError?.message || "Unknown error"}`,
    };
  }

  // 2) Load workspace data for "From" section
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name, email, phone, address")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error("[sendInvoiceEmail] workspace load error:", workspaceError);
  }

  // 3) Load invoice items
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("id, name, description, quantity, unit_price, position")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true, nullsFirst: false });

  if (itemsError) {
    return {
      success: false,
      errorMessage: `Failed to load invoice items: ${itemsError.message}`,
    };
  }

  // 4) Load workspace SMTP settings
  const { data: emailSettings, error: emailSettingsError } = await supabase
    .from("workspace_email_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (emailSettingsError || !emailSettings) {
    return {
      success: false,
      errorMessage: "Email settings not configured. Please configure SMTP settings in Settings > Email & SMTP.",
    };
  }

  if (!emailSettings.smtp_host || !emailSettings.smtp_port) {
    return {
      success: false,
      errorMessage: "SMTP host and port are required",
    };
  }

  // 5) Generate invoice PDF
  const printableInvoice: PrintableInvoice = {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    clientName: invoice.clients?.name || "Client",
    clientEmail: invoice.clients?.email || null,
    clientCompany: invoice.clients?.company || null,
    currency: invoice.currency || "USD",
    items: (items || []).map((item) => ({
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
    notes: invoice.notes || null,
    workspaceName: workspace?.name || "FlowCollect",
    workspaceEmail: workspace?.email || null,
    workspacePhone: workspace?.phone || null,
    workspaceAddress: workspace?.address || null,
    subtotal: Number(invoice.subtotal ?? 0),
    discountPercent: Number(invoice.discount_percent ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxPercent: Number(invoice.tax_percent ?? 0),
    taxAmount: Number(invoice.tax_amount ?? 0),
    total: Number(invoice.amount ?? 0),
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdf(printableInvoice);
  } catch (pdfError) {
    return {
      success: false,
      errorMessage: `Failed to generate PDF: ${pdfError instanceof Error ? pdfError.message : "Unknown error"}`,
    };
  }

  // 6) Create email subject and body
  const workspaceName = workspace?.name || "FlowCollect";
  const invoiceNumber = invoice.invoice_number;
  const subject = `Invoice #${invoiceNumber} from ${workspaceName}`;
  
  const clientName = invoice.clients?.name || "Customer";
  const totalAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: invoice.currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(invoice.amount ?? 0));

  const bodyText = `Dear ${clientName},

Please find attached invoice #${invoiceNumber} for ${totalAmount}.

Invoice Details:
- Issue Date: ${invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : "N/A"}
- Due Date: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}
- Total Amount: ${totalAmount}

${invoice.notes ? `Notes: ${invoice.notes}\n\n` : ""}If you have any questions about this invoice, please contact us.

Thank you for your business.

${workspaceName}${workspace?.email ? `\n${workspace.email}` : ""}${workspace?.phone ? `\n${workspace.phone}` : ""}`;

  const bodyPreview = bodyText.substring(0, 200); // First 200 chars for logging

  // 7) Create nodemailer transport
  const transporter = nodemailer.createTransport({
    host: emailSettings.smtp_host,
    port: emailSettings.smtp_port,
    secure: emailSettings.use_tls ?? true, // true for 465, false for other ports
    auth: emailSettings.smtp_username && emailSettings.smtp_password
      ? {
          user: emailSettings.smtp_username,
          pass: emailSettings.smtp_password,
        }
      : undefined,
  });

  // 8) Send email with PDF attachment
  let sendError: Error | null = null;
  let sendSuccess = false;
  let providerMessageId: string | undefined;

  try {
    const mailOptions = {
      from: emailSettings.from_email
        ? emailSettings.from_name
          ? `${emailSettings.from_name} <${emailSettings.from_email}>`
          : emailSettings.from_email
        : undefined,
      to: toEmail,
      subject,
      text: bodyText,
      attachments: [
        {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    sendSuccess = true;
    providerMessageId = info.messageId;
  } catch (err) {
    sendError = err instanceof Error ? err : new Error(String(err));
    console.error("[sendInvoiceEmail] email send error", err);
  }

  return {
    success: sendSuccess,
    providerMessageId,
    errorMessage: sendError?.message,
    subject,
    bodyPreview,
  };
}
