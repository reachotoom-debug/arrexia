"use server";

import { requireWorkspace } from "@/lib/auth/server";
import { ensurePublicInvoiceUrl } from "@/lib/invoices/ensurePublicAccessToken";

/** Resolves (and lazily creates) the customer-safe public invoice URL for workspace members. */
export async function resolvePublicInvoiceUrlAction(
  workspaceId: string,
  invoiceId: string
): Promise<string | null> {
  await requireWorkspace(workspaceId);
  return ensurePublicInvoiceUrl({ workspaceId, invoiceId });
}
