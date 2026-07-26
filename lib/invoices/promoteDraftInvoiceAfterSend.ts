type InvoiceStatusUpdater = {
  from: (table: string) => {
    update: (values: { status: string }) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (
            column: string,
            value: string
          ) => PromiseLike<{ error: { message: string } | null }>;
        };
      };
    };
  };
};

export function shouldPromoteDraftToSent(
  status: string | null | undefined
): boolean {
  return (status ?? "").toLowerCase() === "draft";
}

export type PromoteDraftAfterSendResult =
  | { promoted: true }
  | { promoted: false; reason: "not_draft" }
  | { promoted: false; reason: "update_failed"; error: string };

export async function promoteDraftInvoiceToSentAfterSend(
  supabase: InvoiceStatusUpdater,
  workspaceId: string,
  invoiceId: string,
  currentStatus: string | null | undefined
): Promise<PromoteDraftAfterSendResult> {
  if (!shouldPromoteDraftToSent(currentStatus)) {
    return { promoted: false, reason: "not_draft" };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .eq("status", "draft");

  if (error) {
    return {
      promoted: false,
      reason: "update_failed",
      error: error.message,
    };
  }

  return { promoted: true };
}

export function revalidatePathsAfterInvoiceSent(
  workspaceId: string,
  invoiceId: string,
  revalidatePath: (path: string) => void
): void {
  revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  revalidatePath(`/${workspaceId}/invoices`);
  revalidatePath(`/${workspaceId}/collections`);
  revalidatePath(`/${workspaceId}/actions`);
  revalidatePath(`/${workspaceId}/dashboard`);
}
