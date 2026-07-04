/**

 * Invoice email sending helper

 * Sends via Resend (central lib/email/sendEmail helper)

 */



import { supabaseServer } from "@/lib/supabase/server";

import { generateInvoicePdf } from "./pdf";

import { buildInvoiceBranding } from "@/app/[workspaceId]/invoices/_utils/branding";

import { hydratePrintableInvoice } from "@/lib/invoices/hydratePrintableInvoice";

import { sendEmail } from "@/lib/email/sendEmail";
import { formatCurrency } from "@/lib/format/currency";
import { renderInvoiceEmail } from "@/lib/email/templates";

export interface SendInvoiceEmailResult {
  success: boolean;

  providerMessageId?: string;

  errorMessage?: string;

  subject?: string;

  bodyPreview?: string;

}



type EmailClientRow = {

  id: string;

  name: string;

  email: string | null;

  company: string | null;

  country: string | null;

  whatsapp_phone: string | null;

  whatsapp: string | null;

};



/**

 * Send an invoice by email with PDF attachment

 */

export async function sendInvoiceEmail(options: {

  workspaceId: string;

  invoiceId: string;

  toEmail: string;

}): Promise<SendInvoiceEmailResult> {

  const { workspaceId, invoiceId, toEmail } = options;

  const supabase = await supabaseServer();



  try {

    const { data: invoice, error: invoiceError } = await supabase

      .from("invoices")

      .select(`

        id,

        workspace_id,

        invoice_number,

        issue_date,

        due_date,

        status,

        currency,

        notes,

        subtotal,

        discount_percent,

        discount_amount,

        tax_percent,

        tax_amount,

        amount,

        payment_terms,

        payment_terms_days,

        clients (

          id,

          name,

          email,

          company,

          country,

          whatsapp_phone,

          whatsapp

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



    const { data: settings, error: settingsError } = await supabase

      .from("settings")

      .select("*")

      .eq("workspace_id", workspaceId)

      .maybeSingle();



    if (settingsError) {

      console.error("[sendInvoiceEmail] settings load error:", settingsError);

    }



    const branding = buildInvoiceBranding(settings);

    const { data: invoiceView } = await supabase

      .from("invoices_view")

      .select("display_status, paid, outstanding")

      .eq("id", invoiceId)

      .maybeSingle();



    const { data: payments } = await supabase

      .from("payments")

      .select("amount, status, archived_at")

      .eq("invoice_id", invoiceId)

      .is("archived_at", null);



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



    const clientData = Array.isArray(invoice.clients)

      ? (invoice.clients[0] as EmailClientRow | undefined)

      : (invoice.clients as EmailClientRow | null);



    const printableInvoice = hydratePrintableInvoice({

      invoice,

      items: (items || []).map((item) => ({

        name: item.name,

        description: item.description,

        quantity: Number(item.quantity),

        unit_price: Number(item.unit_price),

      })),

      settings,

      client: clientData ?? null,

      displayStatus: invoiceView?.display_status || invoice.status,

      invoiceView,

      payments: payments ?? [],

    });



    let pdfBuffer: Buffer;

    try {

      pdfBuffer = await generateInvoicePdf(printableInvoice);

      console.info("[sendInvoiceEmail] pdf generated", {

        workspaceId,

        invoiceId,

        bytes: pdfBuffer.length,

      });

    } catch (pdfError) {

      console.error("[sendInvoiceEmail] error", pdfError);

      return {

        success: false,

        errorMessage: `Failed to generate PDF: ${pdfError instanceof Error ? pdfError.message : "Unknown error"}`,

      };

    }



    const workspaceName = branding.fromName;
    const invoiceNumber = invoice.invoice_number;
    const clientName = clientData?.name || "Customer";
    const currency = invoice.currency || "USD";

    const totalAmount = formatCurrency(Number(invoice.amount ?? 0), { currency });
    const paidAmount =
      invoiceView?.paid != null && Number(invoiceView.paid) > 0
        ? formatCurrency(Number(invoiceView.paid), { currency })
        : null;
    const outstandingAmount =
      invoiceView?.outstanding != null && Number(invoiceView.outstanding) > 0
        ? formatCurrency(Number(invoiceView.outstanding), { currency })
        : null;

    const { html: bodyHtml, text: bodyText, subject } = renderInvoiceEmail({
      businessName: workspaceName,
      logoUrl: branding.logoUrl,
      clientName,
      invoiceNumber,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      totalAmount,
      amountPaid: paidAmount,
      outstandingAmount,
      notes: invoice.notes,
    });

    const bodyPreview = bodyText.substring(0, 200);



    console.info("[sendInvoiceEmail] sending email via Resend", {
      workspaceId,
      invoiceId,
      toEmail,
      invoiceNumber,
    });

    const sendResult = await sendEmail({
      to: toEmail,
      subject,
      html: bodyHtml,
      text: bodyText,
      attachments: [

        {

          filename: `invoice-${invoiceNumber}.pdf`,

          content: pdfBuffer,

          contentType: "application/pdf",

        },

      ],

    });



    console.info("[sendInvoiceEmail] resend result", {

      workspaceId,

      invoiceId,

      success: sendResult.success,

      messageId: sendResult.messageId,

      error: sendResult.error,

    });



    if (!sendResult.success) {

      console.error("[sendInvoiceEmail] error", sendResult.error);

    }



    return {

      success: sendResult.success,

      providerMessageId: sendResult.messageId,

      errorMessage: sendResult.error,

      subject,

      bodyPreview,

    };

  } catch (error) {

    console.error("[sendInvoiceEmail] error", error);

    return {

      success: false,

      errorMessage: error instanceof Error ? error.message : "Failed to send invoice email",

    };

  }

}


