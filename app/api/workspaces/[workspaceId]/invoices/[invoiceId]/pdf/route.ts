/**
 * GET /api/workspaces/[workspaceId]/invoices/[invoiceId]/pdf
 *
 * Legacy-stable API path for invoice PDF download (matches send route pattern).
 */
import { getInvoicePdfResponse } from "@/lib/invoices/invoice-pdf-route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string; invoiceId: string }> }
) {
  const { workspaceId, invoiceId } = await params;
  return getInvoicePdfResponse(workspaceId, invoiceId);
}
