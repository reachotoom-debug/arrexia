import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveCallbackActivationMethod } from "../callbackActivation";
import {
  isRecoveryConfirmOtpType,
  parseRecoveryConfirmSearchParams,
  RECOVERY_CONFIRM_OTP_TYPE,
} from "../recoveryConfirm";
import {
  buildPasswordResetExpiredUrl,
  PASSWORD_RESET_NEXT_PATH,
} from "../passwordRecovery";

describe("recovery confirm OTP type", () => {
  it("H — accepts explicit recovery type only", () => {
    assert.equal(isRecoveryConfirmOtpType("recovery"), true);
    assert.equal(isRecoveryConfirmOtpType("RECOVERY"), true);
    assert.equal(RECOVERY_CONFIRM_OTP_TYPE, "recovery");
  });

  it("H — missing token_hash is rejected", () => {
    const parsed = parseRecoveryConfirmSearchParams(
      new URLSearchParams("type=recovery")
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.reason, "missing_token");
  });

  it("H — missing type is rejected", () => {
    const parsed = parseRecoveryConfirmSearchParams(
      new URLSearchParams("token_hash=abc")
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.reason, "invalid_type");
  });

  it("H — rejects email, signup, and arbitrary types", () => {
    for (const type of ["email", "signup", "magiclink", "invite", "enterprise"]) {
      const parsed = parseRecoveryConfirmSearchParams(
        new URLSearchParams(`token_hash=abc&type=${type}`)
      );
      assert.equal(parsed.ok, false);
      if (!parsed.ok) assert.equal(parsed.reason, "invalid_type");
    }
  });

  it("C — valid recovery TokenHash request parses successfully", () => {
    const parsed = parseRecoveryConfirmSearchParams(
      new URLSearchParams("token_hash=abc123&type=recovery")
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.request.tokenHash, "abc123");
      assert.equal(parsed.request.otpType, "recovery");
    }
  });
});

describe("AUTH-SEC-4A recover route wiring contracts", () => {
  it("D — invalid/expired recovery redirects to reset-password?state=expired", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.match(src, /buildPasswordResetExpiredUrl/);
    assert.equal(
      buildPasswordResetExpiredUrl("https://arrexia.app"),
      "https://arrexia.app/reset-password?state=expired"
    );
  });

  it("C — recover route uses verifyOtp with recovery type", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.match(src, /verifyOtp/);
    assert.match(src, /type:\s*otpType/);
    assert.match(src, new RegExp(`RECOVERY_CONFIRM_OTP_TYPE|"recovery"`));
  });

  it("C — successful recovery redirects to /reset-password with cookies", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.match(src, /PASSWORD_RESET_NEXT_PATH/);
    assert.match(src, /copyCookies/);
    assert.match(src, /supabaseRouteHandler/);
  });

  it("E — recover route NEVER calls activateAccount", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.doesNotMatch(src, /activateAccount/);
  });

  it("F — recover route NEVER creates workspace", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.doesNotMatch(src, /ensureWorkspaceForUser/);
    assert.doesNotMatch(src, /resolvePostLoginDestination/);
  });

  it("G — recover route NEVER initializes trial", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.doesNotMatch(src, /initialTrialPlan/);
    assert.doesNotMatch(src, /parsePublicSignupTrialPlan/);
    assert.doesNotMatch(src, /trial/i);
  });

  it("reset template targets /auth/recover with TokenHash", () => {
    const template = readFileSync("supabase/templates/reset-password.html", "utf8");
    assert.match(
      template,
      /\/auth\/recover\?token_hash=\{\{ \.TokenHash \}\}&type=recovery/
    );
    assert.doesNotMatch(template, /\{\{ \.ConfirmationURL \}\}/);
  });

  it("I — signup confirm route unchanged (email_signup activation)", () => {
    const confirmSrc = readFileSync("app/auth/confirm/route.ts", "utf8");
    assert.match(confirmSrc, /activateAccount\(user\.id,\s*"email_signup"\)/);
    assert.match(confirmSrc, /resolvePostLoginDestination/);
    assert.doesNotMatch(confirmSrc, /type:\s*"recovery"/);
  });

  it("J — OAuth callback activation unchanged", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "google" } as never] },
      }),
      "oauth"
    );
    const callbackSrc = readFileSync("app/auth/callback/route.ts", "utf8");
    assert.match(callbackSrc, /resolveCallbackActivationMethod/);
    assert.match(callbackSrc, /exchangeCodeForSession/);
  });

  it("legacy callback recovery handling preserved", () => {
    const callbackSrc = readFileSync("app/auth/callback/route.ts", "utf8");
    assert.match(callbackSrc, /redirectRecoveryExpired/);
    assert.match(callbackSrc, /recovery_success/);
    assert.match(callbackSrc, /isPasswordRecoveryRequest/);
  });

  it("recover route redirects to PASSWORD_RESET_NEXT_PATH constant", () => {
    assert.equal(PASSWORD_RESET_NEXT_PATH, "/reset-password");
  });
});

describe("AUTH-SEC-4A forgot-password gate preserved", () => {
  it("A — activated account path uses activation check before reset send", () => {
    const src = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
    assert.match(src, /isAccountActivated/);
    assert.match(src, /resetPasswordForEmail/);
    assert.match(src, /supabaseAdmin/);
  });

  it("B — unactivated account gate returns generic success without requiring send", () => {
    const src = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
    assert.match(src, /if \(!activated\)/);
    assert.match(src, /genericSuccessResponse/);
    assert.doesNotMatch(src, /email_confirmed_at/);
  });

  it("forgot-password client still uses server API only", () => {
    const src = readFileSync("app/(auth)/forgot-password/ForgotPasswordClient.tsx", "utf8");
    assert.match(src, /\/api\/auth\/forgot-password/);
    assert.doesNotMatch(src, /resetPasswordForEmail/);
  });
});
