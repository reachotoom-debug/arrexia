"use server";

import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/server";
import { generateCollectionMessage } from "@/lib/ai/generateCollectionMessage";
import { loadAuthoritativeCollectionContext } from "@/lib/ai/loadAuthoritativeCollectionContext";
import { COLLECTION_MESSAGE_TONES } from "@/lib/ai/types";
import { supabaseServer } from "@/lib/supabase/server";
import {
  reserveAiGenerationSlot,
  releaseTrialUsageReservation,
  finalizeTrialUsageReservation,
  type TrialUsageReservation,
} from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";

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

  let aiReservation: TrialUsageReservation | null = null;
  try {
    aiReservation = await reserveAiGenerationSlot(workspaceId);
  } catch (error) {
    if (error instanceof EntitlementError) {
      return {
        ok: false as const,
        code: "entitlement" as const,
        userMessage: error.message,
      };
    }
    throw error;
  }

  const supabase = await supabaseServer();
  const contextResult = await loadAuthoritativeCollectionContext({
    supabase,
    workspaceId,
    invoiceId,
  });

  if (!contextResult.ok) {
    if (aiReservation) {
      await releaseTrialUsageReservation(
        workspaceId,
        aiReservation.resource,
        aiReservation.reservationId,
        1
      );
    }
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

  const result = await generateCollectionMessage({
    facts: contextResult.facts,
    tone,
  });

  if (!result.ok && aiReservation) {
    await releaseTrialUsageReservation(
      workspaceId,
      aiReservation.resource,
      aiReservation.reservationId,
      1
    );
  }

  if (result.ok && aiReservation) {
    await finalizeTrialUsageReservation(workspaceId, aiReservation.reservationId);
  }

  return result;
}
