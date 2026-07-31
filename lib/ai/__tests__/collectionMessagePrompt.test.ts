import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCollectionMessageUserPrompt,
  COLLECTION_MESSAGE_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/collectionMessage";
import {
  ARREXIA_WEBSITE_URL,
  COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER,
  COLLECTION_MESSAGE_CTA,
} from "@/lib/collections/collectionMessageFormat";
import { COLLECTION_MESSAGE_TONES } from "@/lib/ai/types";
import type { CollectionMessageFacts } from "@/lib/ai/types";

const baseFacts: CollectionMessageFacts = {
  clientName: "Acme Corp",
  businessName: "FlowCollect LLC",
  invoiceNumber: "INV-100",
  outstanding: 500,
  outstandingFormatted: "$500.00",
  currency: "USD",
  dueDate: "2026-07-01",
  dueDateFormatted: "Jul 1, 2026",
  daysOverdue: 12,
  isOverdue: true,
  partiallyPaid: false,
  statusLine: "Status: 12 days overdue",
};

describe("collectionMessage prompts", () => {
  it("F — all four tones are supported", () => {
    for (const tone of COLLECTION_MESSAGE_TONES) {
      const prompt = buildCollectionMessageUserPrompt(baseFacts, tone);
      assert.match(prompt, /Tone:/i);
      assert.match(prompt, /INV-100/);
    }
  });

  it("G — immutable-fact instructions are present", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "professional");
    assert.match(prompt, /Authoritative facts/i);
    assert.match(prompt, /immutable/i);
    assert.match(prompt, /OUTSTANDING.*\$500\.00/);
    assert.match(prompt, /INVOICE_NUMBER.*INV-100/);
  });

  it("requires all three scan-friendly fact lines", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "professional");
    assert.match(prompt, /Outstanding: \$500\.00/);
    assert.match(prompt, /Due date: Jul 1, 2026/);
    assert.match(prompt, /Status: 12 days overdue/);
  });

  it("requires improved CTA and already-paid disclaimer", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "professional");
    assert.match(prompt, new RegExp(COLLECTION_MESSAGE_CTA.replace(/\./g, "\\.")));
    assert.match(
      prompt,
      new RegExp(COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER.replace(/\./g, "\\."))
    );
  });

  it("requires branded footer and official URL exactly once", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "professional");
    assert.match(prompt, /Powered by Arrexia/);
    assert.match(prompt, new RegExp(ARREXIA_WEBSITE_URL.replace(/\./g, "\\.")));
    assert.match(prompt, /exactly once/i);
  });

  it("H — threat/legal/fee invention is prohibited in system prompt", () => {
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /Never invent late fees/i);
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /Never claim legal action/i);
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /collection agency/i);
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /Never threaten/i);
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /Do not include any other URLs/i);
  });

  it("I — untrusted strings are marked as data", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "friendly");
    assert.match(prompt, /CLIENT_NAME/);
    assert.match(prompt, /BUSINESS_NAME/);
    assert.match(prompt, /"Acme Corp"/);
    assert.match(COLLECTION_MESSAGE_SYSTEM_PROMPT, /untrusted DATA/i);
  });

  it("E — notes are not included in prompt construction", () => {
    const prompt = buildCollectionMessageUserPrompt(baseFacts, "professional");
    assert.doesNotMatch(prompt, /notes/i);
  });
});
