import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCallbackActivationMethod } from "../callbackActivation";

describe("resolveCallbackActivationMethod", () => {
  it("OAuth callback activates with oauth method", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "google" } as never] },
      }),
      "oauth"
    );
  });

  it("does not activate email signup on callback (authoritative via /auth/confirm)", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "signup",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );

    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "email",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("recovery callback never activates", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: "recovery",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });
});
