import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TRANSACTIONAL_FROM,
  sanitizeReplyToAddress,
  validateFormattedFromIdentity,
  validatePlainEmailAddress,
  containsEmailHeaderInjection,
} from "@/lib/email/emailValidation";
import { ARREXIA_EMAIL_ADDRESSES } from "@/lib/email/addresses";
import {
  getEmailIdentity,
  getInternalRecipient,
  getTransactionalFrom,
  resolveSubmitterReplyTo,
  resolveTransactionalFromIdentity,
} from "@/lib/email/identityConfig";

describe("email addresses validation", () => {
  it("rejects newline injection in email fields", () => {
    assert.equal(containsEmailHeaderInjection("test@example.com\r\nBcc: evil"), true);
    assert.equal(validatePlainEmailAddress("test@example.com\r\nBcc: evil"), false);
  });

  it("validates plain email addresses", () => {
    assert.equal(validatePlainEmailAddress("billing@arrexia.app"), true);
    assert.equal(validatePlainEmailAddress("not-an-email"), false);
  });

  it("validates formatted From identity", () => {
    assert.equal(
      validateFormattedFromIdentity(DEFAULT_TRANSACTIONAL_FROM),
      true
    );
    assert.equal(validateFormattedFromIdentity("Bad From <not-email>"), false);
  });

  it("sanitizes submitter Reply-To candidates", () => {
    assert.equal(sanitizeReplyToAddress(" prospect@example.com "), "prospect@example.com");
    assert.equal(sanitizeReplyToAddress("bad\r\naddress"), null);
  });
});

describe("email identity configuration", () => {
  it("uses central transactional From identity", () => {
    const env = { EMAIL_FROM: "Arrexia <hello@arrexia.app>" };
    assert.equal(getTransactionalFrom(env, "development"), "Arrexia <hello@arrexia.app>");
  });

  it("prefers ARREXIA_EMAIL_FROM over EMAIL_FROM", () => {
    const env = {
      ARREXIA_EMAIL_FROM: "Arrexia <hello@arrexia.app>",
      EMAIL_FROM: "Arrexia <legacy@arrexia.app>",
    };
    assert.equal(getTransactionalFrom(env, "development"), "Arrexia <hello@arrexia.app>");
  });

  it("maps invoice Reply-To to billing", () => {
    assert.equal(getEmailIdentity("invoice").replyTo, ARREXIA_EMAIL_ADDRESSES.billing);
  });

  it("maps reminder Reply-To to collections", () => {
    assert.equal(getEmailIdentity("reminder").replyTo, ARREXIA_EMAIL_ADDRESSES.collections);
  });

  it("maps general internal recipient to hello", () => {
    assert.equal(getInternalRecipient("general"), ARREXIA_EMAIL_ADDRESSES.hello);
  });

  it("maps sales internal recipient to sales", () => {
    assert.equal(getInternalRecipient("sales"), ARREXIA_EMAIL_ADDRESSES.sales);
  });

  it("maps auth Reply-To to support", () => {
    assert.equal(getEmailIdentity("auth").replyTo, ARREXIA_EMAIL_ADDRESSES.support);
  });

  it("maps support internal recipient to support", () => {
    assert.equal(getInternalRecipient("support"), ARREXIA_EMAIL_ADDRESSES.support);
  });

  it("uses validated submitter email as Reply-To only", () => {
    const resolved = resolveSubmitterReplyTo("prospect@example.com");
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.replyTo, "prospect@example.com");
    }
  });

  it("rejects invalid submitter Reply-To", () => {
    const resolved = resolveSubmitterReplyTo("bad\r\naddress");
    assert.equal(resolved.ok, false);
  });

  it("fails safely in production when From identity is missing", () => {
    const resolved = resolveTransactionalFromIdentity({}, "production");
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.match(resolved.error, /must be set in production/i);
    }
  });

  it("prospect email is never used as From in send wiring", async () => {
    const { readFileSync } = await import("node:fs");
    const invoiceSrc = readFileSync("lib/invoices/send-email.ts", "utf8");
    assert.doesNotMatch(invoiceSrc, /from:\s*toEmail/);
    assert.doesNotMatch(invoiceSrc, /from:\s*options\.toEmail/);
  });
});

describe("email send wiring contracts", () => {
  it("invoice send uses central billing Reply-To", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/invoices/send-email.ts", "utf8");
    assert.match(src, /getEmailIdentity\("invoice"\)\.replyTo/);
  });

  it("reminder send uses central collections Reply-To", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(src, /getEmailIdentity\("collections"\)\.replyTo/);
  });

  it("newsletter send uses central identity Reply-To", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/newsletter/sendWelcomeEmail.ts", "utf8");
    assert.match(src, /getEmailIdentity\("newsletter"\)\.replyTo/);
  });

  it("sendEmail supports validated replyTo header", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/email/sendEmail.ts", "utf8");
    assert.match(src, /replyTo/);
    assert.match(src, /sanitizeReplyToAddress/);
  });

  it("identities module is server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/email/identities.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("identityConfig module is server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/email/identityConfig.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("addresses module is server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/email/addresses.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("getEmailSender delegates to central identity config", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/email/getEmailSender.ts", "utf8");
    assert.match(src, /identityConfig/);
  });

  it("default transactional From uses hello@arrexia.app", () => {
    assert.match(DEFAULT_TRANSACTIONAL_FROM, /hello@arrexia\.app/);
  });
});
