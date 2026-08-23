import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildPublicInvoiceUrl } from "@/lib/invoices/publicInvoiceUrl";

const MAX_UNIQUE_COLLISION_RETRIES = 5;

export function generatePublicAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

type InvoiceTokenRow = {
  id: string;
  workspace_id: string;
  status: string;
  archived_at: string | null;
  public_access_token: string | null;
};

async function loadInvoiceForToken(
  workspaceId: string,
  invoiceId: string
): Promise<InvoiceTokenRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("invoices")
    .select("id, workspace_id, status, archived_at, public_access_token")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as InvoiceTokenRow;
}

/**
 * Ensures a persistent public access token for customer-facing invoice links.
 * Returns null for draft/archived/missing invoices without creating a token.
 */
export async function ensurePublicAccessToken(params: {
  workspaceId: string;
  invoiceId: string;
}): Promise<string | null> {
  const invoice = await loadInvoiceForToken(params.workspaceId, params.invoiceId);
  if (!invoice) return null;
  if (invoice.archived_at) return null;
  if (invoice.status === "draft") return null;

  if (invoice.public_access_token) {
    return invoice.public_access_token;
  }

  for (let attempt = 0; attempt < MAX_UNIQUE_COLLISION_RETRIES; attempt++) {
    const candidate = generatePublicAccessToken();

    const { data: updated, error: updateError } = await supabaseAdmin()
      .from("invoices")
      .update({ public_access_token: candidate })
      .eq("id", params.invoiceId)
      .eq("workspace_id", params.workspaceId)
      .is("public_access_token", null)
      .select("public_access_token")
      .maybeSingle();

    if (!updateError && updated?.public_access_token) {
      return updated.public_access_token;
    }

    const refreshed = await loadInvoiceForToken(params.workspaceId, params.invoiceId);
    if (refreshed?.public_access_token) {
      return refreshed.public_access_token;
    }

    if (updateError && !String(updateError.message).includes("duplicate")) {
      console.error("[ensurePublicAccessToken] update failed", {
        workspaceId: params.workspaceId,
        invoiceId: params.invoiceId,
        attempt,
      });
      return null;
    }
  }

  console.error("[ensurePublicAccessToken] exhausted collision retries", {
    workspaceId: params.workspaceId,
    invoiceId: params.invoiceId,
  });
  return null;
}

export async function ensurePublicInvoiceUrl(params: {
  workspaceId: string;
  invoiceId: string;
}): Promise<string | null> {
  const token = await ensurePublicAccessToken(params);
  return token ? buildPublicInvoiceUrl(token) : null;
}
