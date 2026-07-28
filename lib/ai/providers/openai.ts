import "server-only";

import OpenAI from "openai";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 400;

export type OpenAiRuntimeConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export function getOpenAiRuntimeConfig(): OpenAiRuntimeConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    return null;
  }

  const configuredTimeout = Number(process.env.OPENAI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_TIMEOUT_MS;

  return { apiKey, model, timeoutMs };
}

export type OpenAiGenerationResult =
  | { ok: true; text: string }
  | { ok: false; reason: "config" | "timeout" | "provider" | "empty" };

export async function generateOpenAiCollectionMessage(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<OpenAiGenerationResult> {
  const config = getOpenAiRuntimeConfig();
  if (!config) {
    return { ok: false, reason: "config" };
  }

  const client = new OpenAI({ apiKey: config.apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model: config.model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      },
      { signal: controller.signal }
    );

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return { ok: false, reason: "empty" };
    }

    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout =
      (error instanceof Error && error.name === "AbortError") ||
      message.toLowerCase().includes("abort");

    console.error("[openai] collection message generation failed", {
      reason: isTimeout ? "timeout" : "provider",
      message,
    });

    return { ok: false, reason: isTimeout ? "timeout" : "provider" };
  } finally {
    clearTimeout(timeout);
  }
}
