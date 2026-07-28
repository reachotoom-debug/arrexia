import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildWhatsAppClickToChatUrl } from "@/lib/whatsapp/buildWhatsAppClickToChatUrl";

const SERVER_ACTION = "app/[workspaceId]/actions/generateCollectionMessage.ts";
const OPENAI_PROVIDER = "lib/ai/providers/openai.ts";
const AI_DIALOG = "components/collections/AiCollectionAssistDialog.tsx";
const ACTION_CELL = "app/[workspaceId]/actions/_components/CollectionActionCell.tsx";
const COLLECTIONS_PAGE = "app/[workspaceId]/collections/page.tsx";
const COLLECTIONS_TABLE = "app/[workspaceId]/collections/_components/CollectionsTable.tsx";
const LOAD_CONTEXT = "lib/ai/loadAuthoritativeCollectionContext.ts";

describe("AI integration contracts", () => {
  it("P — browser action input contains only workspaceId/invoiceId/tone", () => {
    const src = readFileSync(SERVER_ACTION, "utf8");
    assert.match(src, /workspaceId: z\.string\(\)\.uuid\(\)/);
    assert.match(src, /invoiceId: z\.string\(\)\.uuid\(\)/);
    assert.match(src, /tone: z\.enum\(COLLECTION_MESSAGE_TONES\)/);
    assert.doesNotMatch(src, /outstanding:/);
    assert.doesNotMatch(src, /clientName:/);
    assert.doesNotMatch(src, /businessName:/);
  });

  it("Q — OPENAI_API_KEY is server-only", () => {
    const providerSrc = readFileSync(OPENAI_PROVIDER, "utf8");
    const dialogSrc = readFileSync(AI_DIALOG, "utf8");

    assert.match(providerSrc, /import "server-only"/);
    assert.match(providerSrc, /process\.env\.OPENAI_API_KEY/);
    assert.doesNotMatch(dialogSrc, /OPENAI_API_KEY/);
    assert.doesNotMatch(dialogSrc, /openai/i);
  });

  it("Q2 — chat completions uses max_completion_tokens, not max_tokens", () => {
    const providerSrc = readFileSync(OPENAI_PROVIDER, "utf8");

    assert.match(providerSrc, /max_completion_tokens:\s*MAX_OUTPUT_TOKENS/);
    assert.doesNotMatch(providerSrc, /max_tokens:/);
    assert.doesNotMatch(providerSrc, /temperature:/);
  });

  it("R — provider module avoids leaking raw errors to UI layer", () => {
    const providerSrc = readFileSync(OPENAI_PROVIDER, "utf8");
    const actionSrc = readFileSync(SERVER_ACTION, "utf8");

    assert.match(providerSrc, /console\.error/);
    assert.match(actionSrc, /userMessage/);
    assert.doesNotMatch(actionSrc, /OpenAI/i);
  });

  it("S — AI dialog uses existing WhatsApp URL builder", () => {
    const src = readFileSync(AI_DIALOG, "utf8");
    assert.match(src, /buildWhatsAppClickToChatUrl/);
    assert.doesNotMatch(src, /wa\.me/);
  });

  it("T — invalid phone disables WhatsApp while Copy remains", () => {
    const src = readFileSync(AI_DIALOG, "utf8");
    assert.match(src, /disabled=\{!whatsAppUrl/);
    assert.match(src, /handleCopy/);
    assert.match(src, /Copy/);
  });

  it("U — Daily Action Center exposes AI Assist", () => {
    const src = readFileSync(ACTION_CELL, "utf8");
    assert.match(src, /AiCollectionAssistDialog/);
  });

  it("V — Collections exposes same shared component", () => {
    const pageSrc = readFileSync(COLLECTIONS_PAGE, "utf8");
    const tableSrc = readFileSync(COLLECTIONS_TABLE, "utf8");
    assert.match(pageSrc, /AiCollectionAssistDialog/);
    assert.match(tableSrc, /AiCollectionAssistDialog/);
  });

  it("E — authoritative loader does not select notes for AI context", () => {
    const src = readFileSync(LOAD_CONTEXT, "utf8");
    assert.doesNotMatch(src, /notes/);
  });
});

describe("WhatsApp handoff from AI output", () => {
  it("builds click-to-chat URL from AI message text", () => {
    const url = buildWhatsAppClickToChatUrl({
      phone: "+962779610078",
      clientCountry: "Jordan",
      message: "AI generated collection message",
    });
    assert.match(url!, /wa\.me\/962779610078\?text=/);
  });
});
