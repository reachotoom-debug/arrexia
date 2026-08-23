import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getConfiguredAppUrl } from "@/lib/config/appUrl";
import { buildPublicInvoiceUrl } from "@/lib/invoices/publicInvoiceUrl";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

const ORIGINAL = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("getConfiguredAppUrl canonical public URLs", () => {
  it("9 — production resolves to arrexia.app without explicit env", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.VERCEL_URL = "arrexia-git-main-acme.vercel.app";

    assert.equal(getConfiguredAppUrl(), "https://arrexia.app");
    assert.equal(
      buildPublicInvoiceUrl(TOKEN),
      `https://arrexia.app/i/${TOKEN}`
    );
  });

  it("10 — Vercel deployment hostname is not used in production when canonical URL applies", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "arrexia-git-main-acme.vercel.app";

    const url = buildPublicInvoiceUrl(TOKEN);
    assert.equal(url, `https://arrexia.app/i/${TOKEN}`);
    assert.doesNotMatch(url, /vercel\.app/);
  });

  it("explicit NEXT_PUBLIC_APP_URL is honored", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://arrexia.app";
    process.env.NODE_ENV = "production";
    process.env.VERCEL_URL = "arrexia-git-main-acme.vercel.app";

    assert.equal(getConfiguredAppUrl(), "https://arrexia.app");
  });

  it("preview deployments may use Vercel preview hostname", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "arrexia-pr-42-acme.vercel.app";

    assert.equal(getConfiguredAppUrl(), "https://arrexia-pr-42-acme.vercel.app");
  });

  it("development uses localhost", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_URL;

    assert.equal(getConfiguredAppUrl(), "http://localhost:3000");
  });
});
