import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "../authErrors";
import { parsePostLoginPayload, resolvePostLoginPath } from "../clientRedirect";
import { AUTH_WORKSPACE_RECOVERY_PATH } from "../postLoginRecovery";

describe("parsePostLoginPayload", () => {
  it("Test 7 — parses successful post-login redirect", () => {
    const parsed = parsePostLoginPayload(
      { ok: true, redirectTo: "/11111111-1111-1111-1111-111111111111/dashboard" },
      200
    );

    assert.equal(parsed.redirectTo, "/11111111-1111-1111-1111-111111111111/dashboard");
    assert.equal(parsed.error, null);
  });

  it("Test 8 — surfaces invalid credential failures from API payloads", () => {
    const parsed = parsePostLoginPayload({ ok: false, error: "Invalid login credentials" }, 401);

    assert.equal(parsed.redirectTo, null);
    assert.match(parsed.error ?? "", /invalid login credentials/i);
  });
});

describe("resolvePostLoginPath workspace recovery", () => {
  it("Test 9 — routes authenticated workspace bootstrap failures to /start", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      const result = await resolvePostLoginPath(null);
      assert.equal(result.redirectTo, AUTH_WORKSPACE_RECOVERY_PATH);
      assert.equal(result.error, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
