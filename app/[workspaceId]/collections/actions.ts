"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

const updateNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function updateCollectionsNote(rawInput: unknown) {
  const input = updateNoteSchema.parse(rawInput);
  const supabase = await supabaseServer();

  // Use UPSERT pattern: try to update first, if no rows affected, insert (though invoices.notes should always exist)
  // Since invoices.notes is already a column, we'll use update (which works for both existing and null values)
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
}

const manualContactSchema = z.object({
  workspaceId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  action: z.enum(["send_email_reminder", "copy_email", "mark_contacted"]),
  status: z.enum(["sent", "manual"]),
});

export async function logManualContactAction(rawInput: unknown) {
  try {
    const input = manualContactSchema.parse(rawInput);
    const supabase = await supabaseServer();

    const entry = {
      workspace_id: input.workspaceId,
      invoice_id: input.invoiceId,
      client_id: input.clientId ?? null,
      type: "manual_contact",
      status: input.status,
      channel: "email",
      subject: "Manual contact",
      body: `collections:${input.action}`,
      sent_at: input.status === "sent" ? new Date().toISOString() : null,
    };

    const { error: historyError } = await supabase.from("reminder_history").insert(entry);
    if (historyError) {
      console.error("[Collections] manual contact log failed:", historyError);
      return {
        ok: false,
        message: "Could not save manual contact history.",
      };
    }

    revalidatePath(`/${input.workspaceId}/collections`);
    revalidatePath(`/${input.workspaceId}/reminders`);
    return { ok: true as const };
  } catch (error) {
    console.error("[Collections] manual contact action error:", error);
    return {
      ok: false,
      message: "Could not save manual contact history.",
    };
  }
}

