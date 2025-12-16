/**
 * API route to send invoice by email
 * 
 * POST /api/workspaces/[workspaceId]/invoices/[invoiceId]/send
 * 
 * Body: { toEmail?: string } (optional - falls back to client email)
 * 
 * Returns: { success: boolean, message?: string, error?: string, messageId?: string }
 * 
 * TODO: Future enhancements:
 * - Support multiple recipients
 * - Custom email templates
 * - Rate limiting per workspace
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { sendInvoiceEmail } from "@/lib/invoices/send-email";
import { logAuditEvent } from "@/lib/audit/log";

type SendInvoicePayload = {
  toEmail?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; invoiceId: string }> }
) {
  try {
    const { workspaceId, invoiceId } = await params;
    const { user } = await requireWorkspace(workspaceId);

    const body = (await req.json()) as Partial<SendInvoicePayload>;
    const supabase = await supabaseServer();

    // 1) Verify invoice belongs to workspace
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, workspace_id, client_id, invoice_number")
      .eq("id", invoiceId)
      .eq("workspace_id", workspaceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    // 2) Determine recipient email
    let recipientEmail: string | null = null;

    // If toEmail is provided in body, use it
    if (body.toEmail && typeof body.toEmail === "string" && body.toEmail.trim()) {
      recipientEmail = body.toEmail.trim();
    } else {
      // Fallback to client's email
      const { data: client } = await supabase
        .from("clients")
        .select("email")
        .eq("id", invoice.client_id)
        .single();

      recipientEmail = client?.email ?? null;
    }

    if (!recipientEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Recipient email is required. Please provide toEmail in the request body or ensure the invoice's client has an email address.",
        },
        { status: 400 }
      );
    }

    // 3) Send invoice email
    const result = await sendInvoiceEmail({
      workspaceId,
      invoiceId,
      toEmail: recipientEmail,
    });

    // 4) Log delivery attempt
    const { error: logError } = await supabase
      .from("invoice_delivery_logs")
      .insert({
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        recipient_email: recipientEmail,
        subject: result.subject || `Invoice #${invoice.invoice_number}`,
        body_preview: result.bodyPreview || null,
        provider_message_id: result.providerMessageId || null,
        status: result.success ? "sent" : "failed",
        error_message: result.errorMessage || null,
      });

    if (logError) {
      console.error("[SendInvoiceAPI] failed to log delivery:", logError);
      // Don't fail the request if logging fails, but log the error
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage || "Failed to send invoice email",
        },
        { status: 500 }
      );
    }

    // 5) Log audit event for successful send
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      entityType: "invoice_delivery",
      entityId: invoiceId,
      action: "sent",
      metadata: {
        recipient_email: recipientEmail,
        subject: result.subject,
        provider_message_id: result.providerMessageId,
        invoice_number: invoice.invoice_number,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Invoice sent successfully",
      messageId: result.providerMessageId,
    });
  } catch (err) {
    console.error("[SendInvoiceAPI] unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}
