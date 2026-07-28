import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveCallbackActivationMethod } from "../callbackActivation";
import {
  isRejectedSignupConfirmType,
  isSignupConfirmEmailOtpType,
  parseSignupConfirmNextParams,
  parseSignupConfirmSearchParams,
  SIGNUP_CONFIRM_EMAIL_OTP_TYPE,
} from "../signupConfirm";
import { buildSignupEmailRedirectTo } from "@/lib/config/appUrl";
import { getEmailRedirectTo } from "../signUpResult";

describe("signup confirm OTP type", () => {
  it("A — accepts explicit email type only", () => {
    assert.equal(isSignupConfirmEmailOtpType("email"), true);
    assert.equal(isSignupConfirmEmailOtpType("EMAIL"), true);
    assert.equal(SIGNUP_CONFIRM_EMAIL_OTP_TYPE, "email");
  });

  it("B — missing type is rejected", () => {
    const parsed = parseSignupConfirmSearchParams(
      new URLSearchParams("token_hash=abc")
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.reason, "invalid_type");
  });

  it("C — invalid types are rejected", () => {
    for (const type of ["recovery", "signup", "magiclink", "invite"]) {
      const parsed = parseSignupConfirmSearchParams(
        new URLSearchParams(`token_hash=abc&type=${type}`)
      );
      assert.equal(parsed.ok, false);
      if (!parsed.ok) assert.equal(parsed.reason, "invalid_type");
    }
    assert.equal(isRejectedSignupConfirmType("recovery"), true);
  });

  it("D — recovery type must not be treated as signup confirm", () => {
    assert.equal(isSignupConfirmEmailOtpType("recovery"), false);
  });
});

describe("signup confirm next/plan parsing", () => {
  it("K — Starter plan survives RedirectTo with sibling plan param", () => {
    const params = new URLSearchParams(
      "next=https://arrexia.app/start&plan=starter"
    );
    const parsed = parseSignupConfirmNextParams(params);
    assert.equal(parsed.initialTrialPlan, "starter");
    assert.equal(parsed.nextPath, "/start?plan=starter");
  });

  it("L — Pro plan survives fully encoded RedirectTo", () => {
    const params = new URLSearchParams(
      `next=${encodeURIComponent("https://arrexia.app/start?plan=pro")}`
    );
    const parsed = parseSignupConfirmNextParams(params);
    assert.equal(parsed.initialTrialPlan, "pro");
    assert.equal(parsed.nextPath, "/start?plan=pro");
  });

  it("M — enterprise plan cannot obtain trial entitlement", () => {
    const params = new URLSearchParams(
      "next=https://arrexia.app/start&plan=enterprise"
    );
    const parsed = parseSignupConfirmNextParams(params);
    assert.equal(parsed.initialTrialPlan, null);
    assert.equal(parsed.nextPath, "/start");
  });
});

describe("register emailRedirectTo contract", () => {
  it("uses /start RedirectTo for Supabase signup template", () => {
    assert.equal(
      getEmailRedirectTo("https://arrexia.app", "starter"),
      "https://arrexia.app/start?plan=starter"
    );
    assert.equal(buildSignupEmailRedirectTo("https://arrexia.app"), "https://arrexia.app/start");
  });
});

describe("callback activation after AUTH-SEC-3A", () => {
  it("E — generic callback with email identity and missing type does not activate", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("F — recovery callback classification still does not activate", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: true,
        typeParam: null,
        user: { identities: [{ provider: "email" } as never] },
      }),
      null
    );
  });

  it("G — OAuth callback still activates with oauth", () => {
    assert.equal(
      resolveCallbackActivationMethod({
        isRecovery: false,
        typeParam: null,
        user: { identities: [{ provider: "google" } as never] },
      }),
      "oauth"
    );
  });

  it("explicit signup type on callback does not activate email_signup", () => {
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

describe("AUTH-SEC-3A wiring contracts", () => {
  it("confirm route uses verifyOtp with email type and activateAccount", () => {
    const src = readFileSync("app/auth/confirm/route.ts", "utf8");
    assert.match(src, /verifyOtp/);
    assert.match(src, /type:\s*otpType/);
    assert.match(src, /activateAccount\(user\.id,\s*"email_signup"\)/);
    assert.match(src, /resolvePostLoginDestination/);
    assert.doesNotMatch(src, /ensureWorkspaceForUser/);
  });

  it("confirm signup template targets /auth/confirm with TokenHash", () => {
    const template = readFileSync("supabase/templates/confirm-signup.html", "utf8");
    assert.match(template, /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=email/);
    assert.match(template, /next=\{\{ \.RedirectTo \}\}/);
    assert.doesNotMatch(template, /\{\{ \.ConfirmationURL \}\}/);
  });

  it("confirm route forwards trial plan into bootstrap failure recovery redirect", () => {
    const src = readFileSync("app/auth/confirm/route.ts", "utf8");
    assert.match(src, /initialTrialPlan,/);
    assert.match(src, /nextPath,/);
    assert.match(src, /resolveAuthCallbackFailureRedirect\([\s\S]*initialTrialPlan/);
  });

  it("start page preserves trial plan on retry link", () => {
    const src = readFileSync("app/start/page.tsx", "utf8");
    assert.match(src, /buildWorkspaceRecoveryPath/);
    assert.match(src, /parsePublicSignupTrialPlan/);
    assert.match(src, /retryHref/);
  });
});
