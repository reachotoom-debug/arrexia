import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getConfiguredAppUrl } from "@/lib/config/appUrl";
import { buildPublicInvoiceUrl } from "@/lib/invoices/publicInvoiceUrl";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

const TEST_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",
  "VERCEL_URL",
  "VERCEL_ENV",
] as const;

type TestEnvKey = (typeof TEST_ENV_KEYS)[number];
type TestEnvSnapshot = Record<TestEnvKey, string | undefined>;

/** Test-only view of process.env with writable keys used by app URL resolution. */
function testEnv(): Record<TestEnvKey, string | undefined> {
  return process.env as Record<TestEnvKey, string | undefined>;
}

function captureTestEnv(): TestEnvSnapshot {
  const env = testEnv();
  return {
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: env.NODE_ENV,
    VERCEL_URL: env.VERCEL_URL,
    VERCEL_ENV: env.VERCEL_ENV,
  };
}

function applyTestEnv(patch: Partial<TestEnvSnapshot>): void {
  const env = testEnv();
  for (const key of TEST_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      continue;
    }
    const value = patch[key];
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
}

function restoreTestEnv(snapshot: TestEnvSnapshot): void {
  const env = testEnv();
  for (const key of TEST_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
}

const ORIGINAL = captureTestEnv();

afterEach(() => {
  restoreTestEnv(ORIGINAL);
});

describe("getConfiguredAppUrl canonical public URLs", () => {
  it("9 — production resolves to arrexia.app without explicit env", () => {
    applyTestEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      NODE_ENV: "production",
      VERCEL_ENV: undefined,
      VERCEL_URL: "arrexia-git-main-acme.vercel.app",
    });

    assert.equal(getConfiguredAppUrl(), "https://arrexia.app");
    assert.equal(
      buildPublicInvoiceUrl(TOKEN),
      `https://arrexia.app/i/${TOKEN}`
    );
  });

  it("10 — Vercel deployment hostname is not used in production when canonical URL applies", () => {
    applyTestEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_URL: "arrexia-git-main-acme.vercel.app",
    });

    const url = buildPublicInvoiceUrl(TOKEN);
    assert.equal(url, `https://arrexia.app/i/${TOKEN}`);
    assert.doesNotMatch(url, /vercel\.app/);
  });

  it("explicit NEXT_PUBLIC_APP_URL is honored", () => {
    applyTestEnv({
      NEXT_PUBLIC_APP_URL: "https://arrexia.app",
      NODE_ENV: "production",
      VERCEL_URL: "arrexia-git-main-acme.vercel.app",
    });

    assert.equal(getConfiguredAppUrl(), "https://arrexia.app");
  });

  it("preview deployments may use Vercel preview hostname", () => {
    applyTestEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "arrexia-pr-42-acme.vercel.app",
    });

    assert.equal(getConfiguredAppUrl(), "https://arrexia-pr-42-acme.vercel.app");
  });

  it("development uses localhost", () => {
    applyTestEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      NODE_ENV: "development",
      VERCEL_URL: undefined,
    });

    assert.equal(getConfiguredAppUrl(), "http://localhost:3000");
  });
});
