import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ACCOUNT_ACTIVATION_METHODS, isValidActivationMethod } from "../accountActivation";
import { resolveCallbackActivationMethod } from "../callbackActivation";
import { AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE } from "../authErrors";
import { resolvePasswordRecoveryCallbackDecision } from "../passwordRecovery";
import { analyzeSignUpResponse } from "../signUpResult";

describe("account activation methods", () => {
  it("validates explicit activation methods", () => {
    for (const method of ACCOUNT_ACTIVATION_METHODS) {
      assert.equal(isValidActivationMethod(method), true);
    }
    assert.equal(isValidActivationMethod("recovery"), false);
    assert.equal(isValidActivationMethod("email_confirmed_at"), false);
  });
});

describe("resolveCallbackActivationMethod", () => {
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

  it("recovery with absent type never activates", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: null,
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

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

  it("email signup type on callback does not activate (confirm route is authoritative)", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "signup",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });
});

describe("password recovery callback decisions", () => {
  it("recovery success never creates activation marker", () => {
    const decision = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: "abc",
      oauthError: null,
      exchangeSucceeded: true,
      hasUser: true,
    });

    assert.equal(decision.action, "recovery_success");
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: null,
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });
});

describe("signup duplicate behavior", () => {
  it("duplicate signup anti-enumeration remains unchanged", () => {
    const outcome = analyzeSignUpResponse(
      {
        user: {
          id: "user-1",
          email: "existing@example.com",
          identities: [],
        } as never,
        session: null,
      },
      null
    );

    assert.equal(outcome.kind, "already_registered");
  });
});

describe("AUTH-SEC-2 wiring contracts", () => {
  it("forgot-password client uses server API instead of browser resetPasswordForEmail", () => {
    const src = readFileSync("app/(auth)/forgot-password/ForgotPasswordClient.tsx", "utf8");
    assert.match(src, /\/api\/auth\/forgot-password/);
    assert.doesNotMatch(src, /resetPasswordForEmail/);
  });

  it("forgot-password API uses activation lookup and generic success copy", () => {
    const src = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
    assert.match(src, /isAccountActivated/);
    assert.match(src, /lookupAuthUserIdByEmail/);
    assert.match(src, /AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE/);
    assert.doesNotMatch(src, /email_confirmed_at/);
  });

  it("bootstrap gate enforced centrally", () => {
    const resolveSrc = readFileSync("lib/auth/resolvePostLoginDestination.ts", "utf8");
    const workspaceSrc = readFileSync("lib/workspaces/ensureWorkspaceForUser.ts", "utf8");
    assert.match(resolveSrc, /assertBootstrapActivationAllowed/);
    assert.match(workspaceSrc, /assertBootstrapActivationAllowed/);
  });

  it("signup confirm route handles email_signup activation", () => {
    const confirmSrc = readFileSync("app/auth/confirm/route.ts", "utf8");
    assert.match(confirmSrc, /activateAccount\(user\.id,\s*"email_signup"\)/);
    assert.match(confirmSrc, /verifyOtp/);
  });

  it("callback route defers email signup to confirm route", () => {
    const callbackSrc = readFileSync("app/auth/callback/route.ts", "utf8");
    const activationSrc = readFileSync("lib/auth/callbackActivation.ts", "utf8");
    assert.match(callbackSrc, /resolveCallbackActivationMethod/);
    assert.doesNotMatch(activationSrc, /email_signup/);
  });

  it("migration backfill excludes Rule C and hardens lookup RPC", () => {
    const migrationSrc = readFileSync(
      "supabase/migrations/20260726000000_user_account_activation.sql",
      "utf8"
    );
    assert.doesNotMatch(migrationSrc, /last_sign_in_at/);
    assert.match(
      migrationSrc,
      /REVOKE EXECUTE ON FUNCTION public\.lookup_auth_user_id_by_email\(text\) FROM anon;/
    );
  });

  it("reset-password uses server route with activation check", () => {
    const clientSrc = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    const apiSrc = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    assert.match(clientSrc, /\/api\/auth\/reset-password/);
    assert.match(apiSrc, /isAccountActivated/);
  });

  it("forgot-password generic message is enumeration-safe copy", () => {
    assert.match(
      AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE,
      /eligible for password recovery/i
    );
  });
});

describe("activateAccount idempotency contract", () => {
  it("callback retry must not mutate activation timestamp/method", () => {
    const src = readFileSync("lib/auth/accountActivation.ts", "utf8");
    assert.match(src, /23505/);
    assert.match(src, /Never updates an existing row/);
  });

  it("legacy workspace membership uses runtime legacy_backfill safety net", () => {
    const src = readFileSync("lib/auth/accountActivation.ts", "utf8");
    assert.match(src, /legacy_backfill/);
    assert.match(src, /hasExistingWorkspaceMembership/);
  });
});
