import "server-only";

import {
  buildCollectionMessageUserPrompt,
  COLLECTION_MESSAGE_SYSTEM_PROMPT,
} from "./prompts/collectionMessage";
import { generateOpenAiCollectionMessage } from "./providers/openai";
import type { CollectionMessageFacts, CollectionMessageTone, GenerateCollectionMessageResult } from "./types";
import { validateCollectionMessageOutput } from "./validateCollectionMessageOutput";

const CONFIG_ERROR =
  "Arrexia AI is temporarily unavailable. Please try again.";
const PROVIDER_ERROR =
  "Arrexia AI couldn't generate a message right now. Please try again.";
const UNSAFE_OUTPUT_ERROR =
  "We couldn't produce a safe message. Please try again.";

function mapProviderFailure(
  reason: "config" | "timeout" | "provider" | "empty"
): GenerateCollectionMessageResult {
  if (reason === "config") {
    return { ok: false, code: "config", userMessage: CONFIG_ERROR };
  }

  return { ok: false, code: "provider", userMessage: PROVIDER_ERROR };
}

async function requestValidatedMessage(
  facts: CollectionMessageFacts,
  tone: CollectionMessageTone
): Promise<GenerateCollectionMessageResult> {
  const providerResult = await generateOpenAiCollectionMessage({
    systemPrompt: COLLECTION_MESSAGE_SYSTEM_PROMPT,
    userPrompt: buildCollectionMessageUserPrompt(facts, tone),
  });

  if (!providerResult.ok) {
    return mapProviderFailure(providerResult.reason);
  }

  const validation = validateCollectionMessageOutput({
    message: providerResult.text,
    invoiceNumber: facts.invoiceNumber,
    outstandingFormatted: facts.outstandingFormatted,
    dueDateFormatted: facts.dueDateFormatted,
    statusLine: facts.statusLine,
  });

  if (!validation.ok) {
    return { ok: false, code: "unsafe_output", userMessage: UNSAFE_OUTPUT_ERROR };
  }

  return { ok: true, message: validation.message };
}

export async function generateCollectionMessage(params: {
  facts: CollectionMessageFacts;
  tone: CollectionMessageTone;
}): Promise<GenerateCollectionMessageResult> {
  const firstAttempt = await requestValidatedMessage(params.facts, params.tone);
  if (firstAttempt.ok) {
    return firstAttempt;
  }

  if (firstAttempt.code !== "unsafe_output") {
    return firstAttempt;
  }

  return requestValidatedMessage(params.facts, params.tone);
}
