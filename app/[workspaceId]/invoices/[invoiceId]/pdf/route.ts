import { getInvoicePdfResponse } from "@/lib/invoices/invoice-pdf-route";

interface RouteParams {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { workspaceId, invoiceId } = await params;
  return getInvoicePdfResponse(workspaceId, invoiceId);
}
