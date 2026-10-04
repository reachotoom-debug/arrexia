"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";
import { assertWorkspaceMutationAllowed } from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";

const updateNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function updateCollectionsNote(rawInput: unknown): Promise<
  { ok: true } | { ok: false; error: string; code?: string }
> {
  const input = updateNoteSchema.parse(rawInput);
  await requireWorkspace(input.workspaceId);
  try {
    await assertWorkspaceMutationAllowed(input.workspaceId, "invoice_update");
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("invoices")
    .update({ notes: input.notes ?? null })
    .eq("id", input.invoiceId)
    .eq("workspace_id", input.workspaceId);

  if (error) {
    console.error("[Collections] update note failed:", error);
    throw new Error("Failed to save collection note");
  }

  revalidatePath(`/${input.workspaceId}/collections`);
  revalidatePath(`/${input.workspaceId}/invoices/${input.invoiceId}`);
  return { ok: true };
}
