import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AUTH_PASSWORD_RESET_REAUTHENTICATION_MESSAGE,
  AUTH_PASSWORD_RESET_SAME_PASSWORD_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
  AUTH_PASSWORD_RESET_WEAK_PASSWORD_MESSAGE,
} from "../authErrors";
import {
  logResetPasswordStageSafe,
  mapRecoveryPasswordUpdateError,
} from "../resetPasswordUpdate";

describe("mapRecoveryPasswordUpdateError", () => {
  it("maps same_password to explicit guidance", () => {
    assert.equal(
      mapRecoveryPasswordUpdateError({ code: "same_password", message: "Same password" }),
      AUTH_PASSWORD_RESET_SAME_PASSWORD_MESSAGE
    );
  });

  it("maps weak_password to explicit guidance", () => {
    assert.equal(
      mapRecoveryPasswordUpdateError({ code: "weak_password", message: "Weak password" }),
      AUTH_PASSWORD_RESET_WEAK_PASSWORD_MESSAGE
    );
  });

  it("maps reauthentication_needed to safe recovery guidance", () => {
    assert.equal(
      mapRecoveryPasswordUpdateError({
        code: "reauthentication_needed",
        message: "Reauthentication required",
      }),
      AUTH_PASSWORD_RESET_REAUTHENTICATION_MESSAGE
    );
  });

  it("falls back to generic update failure copy for unknown errors", () => {
    assert.equal(
      mapRecoveryPasswordUpdateError({ code: "unexpected", message: "Something else" }),
      AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE
    );
  });
});

describe("logResetPasswordStageSafe", () => {
  it("does not log secret field names", () => {
    const src = readFileSync("lib/auth/resetPasswordUpdate.ts", "utf8");
    const logStart = src.indexOf("export function logResetPasswordStageSafe");
    const logEnd = src.indexOf("/** @deprecated Use logResetPasswordStageSafe */");
    const logBlock = src.slice(logStart, logEnd);
    assert.doesNotMatch(logBlock, /password:/i);
    assert.doesNotMatch(logBlock, /cookie/i);
    assert.doesNotMatch(logBlock, /token/i);
    assert.doesNotMatch(logBlock, /authorization/i);
    assert.match(logBlock, /stage:/);
    assert.match(logBlock, /errorCode/);
  });
});

describe("reset password server contracts", () => {
  it("uses getUser for server authorization, not getSession", () => {
    const src = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    assert.match(src, /\.auth\.getUser\(/);
    assert.doesNotMatch(src, /\.getSession\(/);
  });

  it("checks activation before updateUser", () => {
    const src = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    const activationIndex = src.indexOf("isAccountActivated");
    const updateIndex = src.indexOf("updateUser({");
    assert.ok(activationIndex >= 0);
    assert.ok(updateIndex >= 0);
    assert.ok(activationIndex < updateIndex);
  });

  it("returns activation failure without reaching updateUser success path", () => {
    const src = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    assert.match(src, /if \(!activated\)/);
    assert.match(src, /AUTH_ACCOUNT_NOT_ACTIVATED_RESET_MESSAGE/);
    assert.match(src, /403/);
  });

  it("propagates cookieHolder on all post-client response branches", () => {
    const src = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    assert.match(src, /401,\s*cookieHolder/);
    assert.match(src, /403,\s*cookieHolder/);
    assert.match(src, /400,\s*cookieHolder/);
    assert.match(src, /200,\s*cookieHolder/);
    assert.match(src, /500,\s*cookieHolder/);
  });

  it("logs updateUser failures with safe stage metadata", () => {
    const src = readFileSync("app/api/auth/reset-password/route.ts", "utf8");
    assert.match(src, /logResetPasswordStageSafe/);
    assert.match(src, /stage: "update_password"/);
    assert.match(src, /errorCode: updateError\.code/);
  });

  it("client delegates password mutation to server API", () => {
    const src = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    assert.match(src, /\/api\/auth\/reset-password/);
    assert.match(src, /credentials: "include"/);
    assert.doesNotMatch(src, /updateUser\(/);
  });

  it("recover route avoids activation/bootstrap/trial", () => {
    const src = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.match(src, /verifyOtp/);
    assert.doesNotMatch(src, /activateAccount/);
    assert.doesNotMatch(src, /ensureWorkspaceForUser/);
    assert.doesNotMatch(src, /trial/i);
  });

  it("signup confirm route unchanged", () => {
    const src = readFileSync("app/auth/confirm/route.ts", "utf8");
    assert.match(src, /activateAccount\(user\.id,\s*"email_signup"\)/);
  });

  it("OAuth callback activation unchanged", () => {
    const src = readFileSync("lib/auth/callbackActivation.ts", "utf8");
    assert.match(src, /oauth/);
    assert.doesNotMatch(src, /email_signup/);
  });

  it("forgot-password activation gate unchanged", () => {
    const src = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
    assert.match(src, /isAccountActivated/);
    assert.match(src, /supabaseAdmin/);
  });
});

describe("logResetPasswordStageSafe invocation", () => {
  it("can be called without throwing for update_password stage", () => {
    assert.doesNotThrow(() => {
      logResetPasswordStageSafe({
        stage: "update_password",
        hasUser: true,
        activationPassed: true,
        errorCode: "same_password",
        errorStatus: 422,
        errorMessage: "Same password",
      });
    });
  });
});
