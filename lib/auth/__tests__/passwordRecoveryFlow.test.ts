import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE } from "../authErrors";
import { resetPasswordSchema } from "../../schemas/auth";
import {
  buildPasswordResetCallbackUrl,
  buildPasswordResetExpiredUrl,
  isPasswordRecoveryCallback,
  isPasswordRecoveryRequest,
  resolvePasswordRecoveryCallbackDecision,
  shouldAllowPasswordResetSubmit,
  shouldSkipWorkspaceBootstrapForRecovery,
  verifyRecoverySessionWithRetry,
} from "../passwordRecovery";

describe("buildPasswordResetCallbackUrl", () => {
  it("Test 1 — recovery callback uses literal ?next=/reset-password", () => {
    const url = buildPasswordResetCallbackUrl("https://arrexia.app");
    assert.equal(url, "https://arrexia.app/auth/callback?next=/reset-password");
  });

  it("Test 2 — does not URL-encode reset-password path", () => {
    const url = buildPasswordResetCallbackUrl("https://arrexia.app");
    assert.ok(url.includes("?next=/reset-password"));
    assert.ok(!url.includes("%2Freset-password"));
  });

  it("Test 3 — apex origin produces correct callback", () => {
    assert.equal(
      buildPasswordResetCallbackUrl("https://arrexia.app"),
      "https://arrexia.app/auth/callback?next=/reset-password"
    );
  });

  it("Test 4 — www origin produces correct callback", () => {
    assert.equal(
      buildPasswordResetCallbackUrl("https://www.arrexia.app"),
      "https://www.arrexia.app/auth/callback?next=/reset-password"
    );
  });

  it("uses localhost callback shape", () => {
    assert.equal(
      buildPasswordResetCallbackUrl("http://localhost:3000"),
      "http://localhost:3000/auth/callback?next=/reset-password"
    );
  });
});

describe("resolvePasswordRecoveryCallbackDecision", () => {
  it("Test 5 — valid recovery code routes to reset-password success", () => {
    const decision = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: "abc",
      oauthError: null,
      exchangeSucceeded: true,
      hasUser: true,
    });

    assert.equal(decision.action, "recovery_success");
  });

  it("Test 6 — recovery success skips workspace bootstrap", () => {
    const decision = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: "abc",
      oauthError: null,
      exchangeSucceeded: true,
      hasUser: true,
    });

    assert.equal(shouldSkipWorkspaceBootstrapForRecovery(decision), true);
  });

  it("Test 7 — expired/missing code routes to recovery expired state", () => {
    const missingCode = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: null,
      oauthError: null,
      exchangeSucceeded: false,
      hasUser: false,
    });
    assert.equal(missingCode.action, "recovery_expired");

    const exchangeFailed = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: "abc",
      oauthError: null,
      exchangeSucceeded: false,
      hasUser: false,
    });
    assert.equal(exchangeFailed.action, "recovery_expired");
  });

  it("Test 8 — external or malformed recovery next does not enter recovery success", () => {
    const externalNext = resolvePasswordRecoveryCallbackDecision({
      next: null,
      typeParam: null,
      code: "abc",
      oauthError: null,
      exchangeSucceeded: true,
      hasUser: true,
    });
    assert.equal(externalNext.action, "continue_auth");

    assert.equal(isPasswordRecoveryCallback("https://evil.example"), false);
    assert.equal(isPasswordRecoveryRequest("https://evil.example", null), false);
  });

  it("detects recovery through type=recovery when next is missing", () => {
    const decision = resolvePasswordRecoveryCallbackDecision({
      next: null,
      typeParam: "recovery",
      code: "abc",
      oauthError: null,
      exchangeSucceeded: true,
      hasUser: true,
    });

    assert.equal(decision.action, "recovery_success");
  });

  it("maps oauth otp_expired to recovery expired", () => {
    const decision = resolvePasswordRecoveryCallbackDecision({
      next: "/reset-password",
      typeParam: null,
      code: null,
      oauthError: "otp_expired",
      exchangeSucceeded: false,
      hasUser: false,
    });

    assert.equal(decision.action, "recovery_expired");
    assert.equal(
      buildPasswordResetExpiredUrl("https://arrexia.app"),
      "https://arrexia.app/reset-password?state=expired"
    );
  });
});

describe("verifyRecoverySessionWithRetry", () => {
  it("Test 9 — valid recovery session enables update flow", async () => {
    let attempts = 0;
    const hasSession = await verifyRecoverySessionWithRetry(async () => {
      attempts += 1;
      return { data: { user: attempts >= 2 ? { id: "user-1" } : null } };
    });

    assert.equal(hasSession, true);
    assert.equal(attempts, 2);
  });

  it("Test 10 — missing session shows expired/invalid state", async () => {
    const hasSession = await verifyRecoverySessionWithRetry(async () => ({
      data: { user: null },
    }));

    assert.equal(hasSession, false);
  });
});

describe("resetPasswordSchema", () => {
  it("Test 11 — accepts valid matching passwords", () => {
    const parsed = resetPasswordSchema.safeParse({
      password: "secret123",
      confirmPassword: "secret123",
    });

    assert.equal(parsed.success, true);
  });

  it("Test 12 — rejects invalid password length", () => {
    const parsed = resetPasswordSchema.safeParse({
      password: "123",
      confirmPassword: "123",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects mismatched confirmation", () => {
    const parsed = resetPasswordSchema.safeParse({
      password: "secret123",
      confirmPassword: "secret456",
    });

    assert.equal(parsed.success, false);
  });
});

describe("password reset submission guard", () => {
  it("Test 14 — duplicate submission prevented while locked or expired", () => {
    assert.equal(
      shouldAllowPasswordResetSubmit({
        submitLocked: true,
        isSubmitting: false,
        sessionExpired: false,
        completed: false,
      }),
      false
    );

    assert.equal(
      shouldAllowPasswordResetSubmit({
        submitLocked: false,
        isSubmitting: false,
        sessionExpired: true,
        completed: false,
      }),
      false
    );
  });

  it("allows submission for valid active session", () => {
    assert.equal(
      shouldAllowPasswordResetSubmit({
        submitLocked: false,
        isSubmitting: false,
        sessionExpired: false,
        completed: false,
      }),
      true
    );
  });

  it("Test 15 — completed reset prevents duplicate submission", () => {
    assert.equal(
      shouldAllowPasswordResetSubmit({
        submitLocked: false,
        isSubmitting: false,
        sessionExpired: false,
        completed: true,
      }),
      false
    );
  });
});

describe("password reset error mapping", () => {
  it("Test 13 — updateUser failure maps to safe UI error", async () => {
    const { mapPasswordResetUpdateError } = await import("../passwordRecovery");
    assert.equal(
      mapPasswordResetUpdateError("Session expired"),
      AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE
    );
  });
});

describe("post-reset login compatibility", () => {
  it("Test 16 — post-reset login still uses A2 credential mapping", async () => {
    const { mapSupabaseAuthError, AUTH_INVALID_CREDENTIALS_MESSAGE } = await import("../authErrors");
    assert.equal(
      mapSupabaseAuthError("Invalid login credentials", "login"),
      AUTH_INVALID_CREDENTIALS_MESSAGE
    );
  });
});
