import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("PasswordInput component", () => {
  const src = readFileSync("components/auth/PasswordInput.tsx", "utf8");

  it("defaults to hidden password type", () => {
    assert.match(src, /useState\(false\)/);
    assert.match(src, /visible \? "text" : "password"/);
  });

  it("toggles between password and text visibility", () => {
    assert.match(src, /setVisible\(\(current\) => !current\)/);
    assert.match(src, /EyeOff/);
    assert.match(src, /Eye/);
  });

  it("uses button type button for the toggle", () => {
    assert.match(src, /type="button"/);
  });

  it("exposes accessible show/hide labels", () => {
    assert.match(src, /aria-label=\{visible \? "Hide password" : "Show password"\}/);
    assert.match(src, /aria-pressed=\{visible\}/);
  });
});

describe("auth password field contracts", () => {
  it("login uses current-password autocomplete", () => {
    const src = readFileSync("app/(auth)/login/LoginClient.tsx", "utf8");
    assert.match(src, /PasswordInput/);
    assert.match(src, /autoComplete="current-password"/);
  });

  it("register uses new-password autocomplete", () => {
    const src = readFileSync("app/(auth)/register/RegisterClient.tsx", "utf8");
    assert.match(src, /autoComplete="new-password"/);
    assert.doesNotMatch(src, /type="password"/);
  });

  it("reset password uses new-password and hidden username field", () => {
    const src = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    assert.match(src, /autoComplete="new-password"/);
    assert.match(src, /autoComplete="username"/);
    assert.match(src, /className="sr-only"/);
  });

  it("reset loading shell renders before session verification completes", () => {
    const clientSrc = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    const pageSrc = readFileSync("app/(auth)/reset-password/page.tsx", "utf8");
    assert.match(clientSrc, /if \(isCheckingSession\) \{\s*return <ResetPasswordLoadingShell \/>;/);
    assert.match(pageSrc, /fallback=\{<ResetPasswordLoadingShell/);
  });

  it("expired reset state remains intact", () => {
    const src = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    assert.match(src, /RESET_LINK_EXPIRED_TITLE/);
    assert.match(src, /Request another reset link/);
  });

  it("success reset state remains intact", () => {
    const src = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    assert.match(src, /PASSWORD_RESET_SUCCESS_TITLE/);
    assert.match(src, /Sign in/);
  });

  it("login and register email fields keep email autocomplete", () => {
    const loginSrc = readFileSync("app/(auth)/login/LoginClient.tsx", "utf8");
    const registerSrc = readFileSync("app/(auth)/register/RegisterClient.tsx", "utf8");
    assert.match(loginSrc, /autoComplete="email"/);
    assert.match(registerSrc, /autoComplete="email"/);
  });
});

describe("auth UX security non-regression", () => {
  it("does not modify confirm/recover server routes", () => {
    const confirmSrc = readFileSync("app/auth/confirm/route.ts", "utf8");
    const recoverSrc = readFileSync("app/auth/recover/route.ts", "utf8");
    assert.match(confirmSrc, /activateAccount\(user\.id,\s*"email_signup"\)/);
    assert.match(recoverSrc, /verifyOtp/);
    assert.doesNotMatch(recoverSrc, /activateAccount/);
  });

  it("reset password still uses server API for mutation", () => {
    const src = readFileSync("app/(auth)/reset-password/ResetPasswordClient.tsx", "utf8");
    assert.match(src, /\/api\/auth\/reset-password/);
  });
});
