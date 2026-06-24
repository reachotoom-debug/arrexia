import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspaceForApi } from "@/lib/auth/server";
import { sendInvoiceEmail } from "@/lib/invoices/send-email";
import { logAuditEvent } from "@/lib/audit/log";
import { validateSandboxRecipient } from "@/lib/email/sendEmail";

export type SendInvoicePayload = {
  toEmail?: string;
};

export type SendInvoiceJsonBody =
  | {
      ok: true;
      success: true;
      message: string;
      messageId?: string;
    }
  | {
      ok: false;
      success: false;
      error: string;
    };

function jsonResponse(body: SendInvoiceJsonBody, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function postSendInvoiceEmail(
  workspaceId: string,
  invoiceId: string,
  body: Partial<SendInvoicePayload>
): Promise<NextResponse<SendInvoiceJsonBody>> {
  const auth = await requireWorkspaceForApi(workspaceId);
  if (!auth.ok) {
    return jsonResponse(
      { ok: false, success: false, error: auth.error },
      auth.status
    );
  }

  const { user } = auth;
  const supabase = await supabaseServer();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, workspace_id, client_id, invoice_number")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    return jsonResponse(
      { ok: false, success: false, error: "Invoice not found" },
      404
    );
  }

  let recipientEmail: string | null = null;

  if (body.toEmail && typeof body.toEmail === "string" && body.toEmail.trim()) {
    recipientEmail = body.toEmail.trim();
  } else {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("id", invoice.client_id)
      .single();

    recipientEmail = client?.email ?? null;
  }

  if (!recipientEmail) {
    return jsonResponse(
      {
        ok: false,
        success: false,
        error:
          "Recipient email is required. Please provide toEmail in the request body or ensure the invoice's client has an email address.",
      },
      400
    );
  }

  const sandboxError = validateSandboxRecipient(recipientEmail);
  if (sandboxError) {
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: sandboxError,
      },
      400
    );
  }

  let result;
  try {
    result = await sendInvoiceEmail({
      workspaceId,
      invoiceId,
      toEmail: recipientEmail,
    });
  } catch (error) {
    console.error("[send-invoice-email]", error);
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: error instanceof Error ? error.message : "Failed to send invoice email",
      },
      500
    );
  }

  const { error: logError } = await supabase.from("invoice_delivery_logs").insert({
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
    console.error("[send-invoice-email] failed to log delivery:", logError);
  }

  if (!result.success) {
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: result.errorMessage || "Failed to send invoice email",
      },
      500
    );
  }

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

  return jsonResponse(
    {
      ok: true,
      success: true,
      message: "Invoice sent successfully",
      messageId: result.providerMessageId,
    },
    200
  );
}
