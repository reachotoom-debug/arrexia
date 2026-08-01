import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  PUBLIC_ARREXIA_EMAIL_ADDRESSES,
  PUBLIC_CONTACT_CHANNELS,
  buildMailtoHref,
  getEnterpriseContactHref,
  getGeneralContactMailtoHref,
  getSupportContactMailtoHref,
} from "@/lib/email/publicAddresses";

describe("public contact routing", () => {
  it("routes general enquiries to hello@arrexia.app", () => {
    assert.match(getGeneralContactMailtoHref(), /^mailto:hello@arrexia\.app/);
    assert.equal(
      PUBLIC_CONTACT_CHANNELS.find((channel) => channel.email.includes("hello"))?.email,
      PUBLIC_ARREXIA_EMAIL_ADDRESSES.hello
    );
  });

  it("routes technical support to support@arrexia.app", () => {
    assert.match(getSupportContactMailtoHref(), /^mailto:support@arrexia\.app/);
    assert.equal(
      PUBLIC_CONTACT_CHANNELS.find((channel) => channel.email.includes("support"))?.email,
      PUBLIC_ARREXIA_EMAIL_ADDRESSES.support
    );
  });

  it("routes Contact Sales / Enterprise to sales@arrexia.app", () => {
    assert.match(getEnterpriseContactHref(), /^mailto:sales@arrexia\.app/);
    assert.match(getEnterpriseContactHref(), /Enterprise%20inquiry|Enterprise inquiry/);
    assert.equal(
      PUBLIC_CONTACT_CHANNELS.find((channel) => channel.email.includes("sales"))?.email,
      PUBLIC_ARREXIA_EMAIL_ADDRESSES.sales
    );
  });

  it("builds mailto links without exposing internal billing or collections addresses", () => {
    const publicValues = Object.values(PUBLIC_ARREXIA_EMAIL_ADDRESSES).join(" ");
    assert.doesNotMatch(publicValues, /billing@/);
    assert.doesNotMatch(publicValues, /collections@/);
  });

  it("contact page imports only client-safe public address module", () => {
    const src = readFileSync("app/(public)/contact/page.tsx", "utf8");
    assert.match(src, /publicAddresses/);
    assert.doesNotMatch(src, /lib\/email\/addresses/);
    assert.doesNotMatch(src, /identityConfig/);
    assert.doesNotMatch(src, /identities/);
  });

  it("plans re-exports enterprise contact href from public addresses", () => {
    const src = readFileSync("lib/billing/plans.ts", "utf8");
    assert.match(src, /getEnterpriseContactHref/);
    assert.match(src, /publicAddresses/);
  });
});

describe("email module server/client boundary", () => {
  it("identityConfig module is server-only", () => {
    const src = readFileSync("lib/email/identityConfig.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("addresses module is server-only", () => {
    const src = readFileSync("lib/email/addresses.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("identities module is server-only", () => {
    const src = readFileSync("lib/email/identities.ts", "utf8");
    assert.match(src, /import "server-only"/);
  });

  it("publicAddresses module does not read process.env", () => {
    const src = readFileSync("lib/email/publicAddresses.ts", "utf8");
    assert.doesNotMatch(src, /process\.env/);
  });

  it("seo site config imports only public addresses", () => {
    const src = readFileSync("lib/seo/site.ts", "utf8");
    assert.match(src, /publicAddresses/);
    assert.doesNotMatch(src, /lib\/email\/addresses/);
  });
});

describe("public mailto helpers", () => {
  it("encodes subject lines safely", () => {
    assert.equal(
      buildMailtoHref("hello@arrexia.app", "General inquiry"),
      "mailto:hello@arrexia.app?subject=General%20inquiry"
    );
  });
});
