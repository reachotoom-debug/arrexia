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
  it("G — recovery callback never activates", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: "recovery",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("A — recovery with absent type and email identity never activates", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: null,
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("B — email signup confirmation activates with type=signup", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "signup",
        user: { identities: [{ provider: "email" } as never] },
      }),
      "email_signup"
    );
  });

  it("L — OAuth callback activates with oauth method", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "google" } as never] },
      }),
      "oauth"
    );
  });

  it("O — recovery type prevents activation even with email identity", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "recovery",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("does not activate magic-link callbacks", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: "magiclink",
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });
});

describe("password recovery callback decisions", () => {
  it("G — recovery success never creates activation marker", () => {
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
  it("P — duplicate signup anti-enumeration remains unchanged", () => {
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
  it("A — forgot-password client uses server API instead of browser resetPasswordForEmail", () => {
    const src = readFileSync("app/(auth)/forgot-password/ForgotPasswordClient.tsx", "utf8");
    assert.match(src, /\/api\/auth\/forgot-password/);
    assert.doesNotMatch(src, /resetPasswordForEmail/);
  });

  it("C/D — forgot-password API uses activation lookup and generic success copy", () => {
    const src = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
    assert.match(src, /isAccountActivated/);
    assert.match(src, /lookupAuthUserIdByEmail/);
    assert.match(src, /AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE/);
    assert.doesNotMatch(src, /email_confirmed_at/);
  });

  it("I/J — bootstrap gate enforced centrally", () => {
    const resolveSrc = readFileSync("lib/auth/resolvePostLoginDestination.ts", "utf8");
    const workspaceSrc = readFileSync("lib/workspaces/ensureWorkspaceForUser.ts", "utf8");
    assert.match(resolveSrc, /assertBootstrapActivationAllowed/);
    assert.match(workspaceSrc, /assertBootstrapActivationAllowed/);
  });

  it("auth callback activates only on continue_auth with route isRecovery", () => {
    const src = readFileSync("app/auth/callback/route.ts", "utf8");
    assert.match(src, /resolveCallbackActivationMethod/);
    assert.match(src, /activateAccount/);
    assert.match(src, /successDecision\.action === "continue_auth"/);
    assert.match(src, /isRecovery,/);
    assert.doesNotMatch(src, /isRecovery:\s*false/);
    assert.doesNotMatch(src, /email_confirmed_at/);
  });

  it("migration backfill excludes Rule C and hardens lookup RPC", () => {
    const migrationSrc = readFileSync(
      "supabase/migrations/20260726000000_user_account_activation.sql",
      "utf8"
    );
    assert.doesNotMatch(migrationSrc, /last_sign_in_at/);
    assert.doesNotMatch(migrationSrc, /interval '7 days'/);
    assert.match(
      migrationSrc,
      /REVOKE EXECUTE ON FUNCTION public\.lookup_auth_user_id_by_email\(text\) FROM PUBLIC;/
    );
    assert.match(
      migrationSrc,
      /REVOKE EXECUTE ON FUNCTION public\.lookup_auth_user_id_by_email\(text\) FROM anon;/
    );
    assert.match(
      migrationSrc,
      /REVOKE EXECUTE ON FUNCTION public\.lookup_auth_user_id_by_email\(text\) FROM authenticated;/
    );
    assert.match(
      migrationSrc,
      /GRANT EXECUTE ON FUNCTION public\.lookup_auth_user_id_by_email\(text\) TO service_role;/
    );
  });

  it("N — activation logic does not trust email_confirmed_at", () => {
    const activationSrc = readFileSync("lib/auth/accountActivation.ts", "utf8");
    const migrationSrc = readFileSync(
      "supabase/migrations/20260726000000_user_account_activation.sql",
      "utf8"
    );
    assert.doesNotMatch(activationSrc, /email_confirmed_at/);
    assert.doesNotMatch(migrationSrc, /email_confirmed_at/);
    assert.doesNotMatch(migrationSrc, /last_sign_in_at/);
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
  it("H — callback retry must not mutate activation timestamp/method", () => {
    const src = readFileSync("lib/auth/accountActivation.ts", "utf8");
    assert.match(src, /23505/);
    assert.match(src, /Never updates an existing row/);
  });

  it("M — legacy workspace membership uses runtime legacy_backfill safety net", () => {
    const src = readFileSync("lib/auth/accountActivation.ts", "utf8");
    assert.match(src, /legacy_backfill/);
    assert.match(src, /hasExistingWorkspaceMembership/);
  });
});
