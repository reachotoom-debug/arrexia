"use server";

import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/server";
import { generateCollectionMessage } from "@/lib/ai/generateCollectionMessage";
import { loadAuthoritativeCollectionContext } from "@/lib/ai/loadAuthoritativeCollectionContext";
import { COLLECTION_MESSAGE_TONES } from "@/lib/ai/types";
import { supabaseServer } from "@/lib/supabase/server";

const GenerateCollectionMessageInputSchema = z.object({
  workspaceId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  tone: z.enum(COLLECTION_MESSAGE_TONES),
});

export type GenerateCollectionMessageActionInput = z.infer<
  typeof GenerateCollectionMessageInputSchema
>;

export async function generateCollectionMessageAction(
  input: GenerateCollectionMessageActionInput
) {
  const parsed = GenerateCollectionMessageInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      code: "validation" as const,
      userMessage: "Arrexia AI couldn't generate a message right now. Please try again.",
    };
  }

  const { workspaceId, invoiceId, tone } = parsed.data;

  await requireWorkspace(workspaceId);

  const supabase = await supabaseServer();
  const contextResult = await loadAuthoritativeCollectionContext({
    supabase,
    workspaceId,
    invoiceId,
  });

  if (!contextResult.ok) {
    if (contextResult.code === "paid" || contextResult.code === "ineligible") {
      return {
        ok: false as const,
        code: contextResult.code,
        userMessage: "This invoice no longer needs collection action.",
      };
    }

    return {
      ok: false as const,
      code: "not_found" as const,
      userMessage: "This invoice is no longer available.",
    };
  }

  return generateCollectionMessage({
    facts: contextResult.facts,
    tone,
  });
}
