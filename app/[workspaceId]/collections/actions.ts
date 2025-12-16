"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

const updateNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function updateCollectionsNote(rawInput: unknown) {
  const input = updateNoteSchema.parse(rawInput);
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("invoices")
    .update({ notes: input.notes ?? null })
    .eq("id", input.invoiceId)
    .eq("organization_id", ORGANIZATION_ID);

  if (error) {
    console.error("[Collections] update note failed:", error);
    throw new Error("Failed to update invoice note");
  }

  revalidatePath(`/${input.workspaceId}/collections`);
  revalidatePath(`/${input.workspaceId}/invoices/${input.invoiceId}`);
}

