import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCallbackActivationMethod } from "../callbackActivation";

const emailUser = { identities: [{ provider: "email" } as never] };

describe("resolveCallbackActivationMethod email signup evidence", () => {
  it("A — recovery + type absent + email identity does not activate", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: null,
        user: emailUser,
      }),
      null
    );
  });

  it("B — recovery + type=recovery does not activate", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: "recovery",
        user: emailUser,
      }),
      null
    );
  });

  it("C — email signup callback activates with explicit signup type", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "signup",
        user: emailUser,
      }),
      "email_signup"
    );
  });

  it("D — OAuth callback activates with oauth method", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "google" } as never] },
      }),
      "oauth"
    );
  });

  it("does not activate email identity alone without explicit signup type", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: emailUser,
      }),
      null
    );
  });

  it("prefers oauth when google identity is present", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "signup",
        user: {
          identities: [{ provider: "email" } as never, { provider: "google" } as never],
        },
      }),
      "oauth"
    );
  });

  it("rejects unknown type without oauth identity", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "invite",
        user: emailUser,
      }),
      null
    );
  });
});
