/**
 * POST /api/workspaces/[workspaceId]/invoices/[invoiceId]/send
 *
 * Legacy API path — delegates to shared handler. Always returns JSON.
 */
import { NextRequest } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  postSendInvoiceEmail,
  type SendInvoicePayload,
} from "@/lib/invoices/send-invoice-route";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; invoiceId: string }> }
) {
  try {
    const { workspaceId, invoiceId } = await params;
    let body: Partial<SendInvoicePayload> = {};

    try {
      body = (await req.json()) as Partial<SendInvoicePayload>;
    } catch {
      body = {};
    }

    return await postSendInvoiceEmail(workspaceId, invoiceId, body);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("[send-invoice-email]", error);
    return Response.json(
      {
        ok: false,
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
