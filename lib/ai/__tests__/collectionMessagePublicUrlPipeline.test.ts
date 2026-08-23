import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateCollectionMessageOutput } from "@/lib/ai/validateCollectionMessageOutput";
import { ARREXIA_WEBSITE_URL } from "@/lib/collections/collectionMessageFormat";
import {
  appendPublicInvoiceLinkToCollectionMessage,
  formatPublicInvoiceLinkBlock,
} from "@/lib/invoices/publicInvoiceMessageLink";
import { buildPublicInvoiceUrl } from "@/lib/invoices/publicInvoiceUrl";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const publicUrl = buildPublicInvoiceUrl(TOKEN);

const invoiceNumber = "INV-100";
const outstandingFormatted = "$500.00";
const dueDateFormatted = "Jul 1, 2026";
const statusLine = "Status: 12 days overdue";

const aiProseOnly = `Hello Acme Corp,

This is a payment reminder from FlowCollect LLC regarding invoice INV-100.
Outstanding: $500.00
Due date: Jul 1, 2026
Status: 12 days overdue

Please let us know once payment has been arranged.
If payment has already been made, kindly disregard this reminder.

Thank you,
FlowCollect LLC
Powered by Arrexia
${ARREXIA_WEBSITE_URL}`;

const baseValidation = {
  invoiceNumber,
  outstandingFormatted,
  dueDateFormatted,
  statusLine,
};

describe("collection message public URL pipeline", () => {
  it("1 — normal AI prose passes before trusted URL append", () => {
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: aiProseOnly,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(result.ok, true);
  });

  it("2 — trusted public invoice URL is appended exactly once in final message", () => {
    const finalMessage = appendPublicInvoiceLinkToCollectionMessage(aiProseOnly, publicUrl);
    const linkBlock = formatPublicInvoiceLinkBlock(publicUrl);
    assert.equal(finalMessage.split(linkBlock).length - 1, 1);

    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: finalMessage,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: true,
    });
    assert.equal(result.ok, true);
  });

  it("3 — external model-generated URL is rejected in AI prose", () => {
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: `${aiProseOnly}\nPay at https://evil.example/phish`,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "url");
  });

  it("4 — internal authenticated invoice URL is rejected", () => {
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: aiProseOnly.replace(
        ARREXIA_WEBSITE_URL,
        "https://arrexia.app/ws-123/invoices/inv-456"
      ),
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "url");
  });

  it("5 — javascript: and data: URLs are rejected", () => {
    const javascriptResult = validateCollectionMessageOutput({
      ...baseValidation,
      message: `${aiProseOnly}\njavascript:alert(1)`,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(javascriptResult.ok, false);
    if (!javascriptResult.ok) assert.equal(javascriptResult.reason, "url");

    const dataResult = validateCollectionMessageOutput({
      ...baseValidation,
      message: `${aiProseOnly}\ndata:text/html,<script>`,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(dataResult.ok, false);
    if (!dataResult.ok) {
      assert.ok(["url", "html"].includes(dataResult.reason));
    }
  });

  it("6 — model-generated public invoice URL is rejected before append", () => {
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: `${aiProseOnly.replace(
        `Powered by Arrexia\n${ARREXIA_WEBSITE_URL}`,
        `View invoice:\n${publicUrl}\n\nPowered by Arrexia\n${ARREXIA_WEBSITE_URL}`
      )}`,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "url");
  });

  it("7 — public invoice URL does not cause otherwise valid AI output to fail pre-append", () => {
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: aiProseOnly,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(result.ok, true);
  });

  it("8 — AI model is not required to generate the invoice URL itself", () => {
    const preAppend = validateCollectionMessageOutput({
      ...baseValidation,
      message: aiProseOnly,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: false,
    });
    assert.equal(preAppend.ok, true);

    const withTrustedLink = appendPublicInvoiceLinkToCollectionMessage(
      aiProseOnly,
      publicUrl
    );
    const postAppend = validateCollectionMessageOutput({
      ...baseValidation,
      message: withTrustedLink,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: true,
    });
    assert.equal(postAppend.ok, true);
  });

  it("duplicate public invoice URLs in final message are rejected", () => {
    const block = formatPublicInvoiceLinkBlock(publicUrl);
    const duplicated = appendPublicInvoiceLinkToCollectionMessage(aiProseOnly, publicUrl);
    const withDuplicate = `${duplicated}\n${block}`;

    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: withDuplicate,
      allowedPublicInvoiceUrl: publicUrl,
      requirePublicInvoiceUrlInMessage: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "url");
  });
});
