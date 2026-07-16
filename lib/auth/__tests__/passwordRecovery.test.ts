import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  PASSWORD_RESET_CALLBACK_QUERY,
  buildPasswordResetCallbackUrl,
} from "../passwordRecovery";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  }
});

describe("buildPasswordResetCallbackUrl", () => {
  it("uses explicit production origin", () => {
    const url = buildPasswordResetCallbackUrl("https://arrexia.app");
    assert.equal(url, "https://arrexia.app/auth/callback?next=/reset-password");
  });

  it("uses browser-style www origin", () => {
    const url = buildPasswordResetCallbackUrl("https://www.arrexia.app");
    assert.equal(url, "https://www.arrexia.app/auth/callback?next=/reset-password");
  });

  it("uses localhost origin", () => {
    const url = buildPasswordResetCallbackUrl("http://localhost:3000");
    assert.equal(url, "http://localhost:3000/auth/callback?next=/reset-password");
  });

  it("strips trailing slash from origin", () => {
    const url = buildPasswordResetCallbackUrl("https://arrexia.app/");
    assert.equal(url, "https://arrexia.app/auth/callback?next=/reset-password");
    assert.doesNotMatch(url, /\/\/auth\/callback/);
  });

  it("uses configured fallback origin when no explicit origin is provided", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://my-preview.vercel.app";
    const url = buildPasswordResetCallbackUrl();
    assert.equal(url, "https://my-preview.vercel.app/auth/callback?next=/reset-password");
  });

  it("does not URL-encode the next path slash", () => {
    const url = buildPasswordResetCallbackUrl("https://arrexia.app");
    assert.equal(PASSWORD_RESET_CALLBACK_QUERY, "next=/reset-password");
    assert.ok(url.includes("?next=/reset-password"));
    assert.ok(!url.includes("%2Freset-password"));
  });

  it("never returns root-only site URL", () => {
    const origins = [
      "https://arrexia.app",
      "https://www.arrexia.app",
      "http://localhost:3000",
      "https://my-preview.vercel.app",
    ];

    for (const origin of origins) {
      const url = buildPasswordResetCallbackUrl(origin);
      assert.ok(url.includes("/auth/callback"), `missing callback path for ${origin}`);
      assert.notEqual(url, origin.replace(/\/+$/, ""));
    }
  });
});
