import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "../authErrors";
import { isPasswordRecoveryCallback } from "../passwordRecovery";
import {
  AUTH_WORKSPACE_RECOVERY_PATH,
  buildPostLoginDestinationPath,
  resolveAuthCallbackFailureRedirect,
  resolveAuthenticatedBootstrapFailureRedirect,
} from "../postLoginRecovery";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

describe("buildPostLoginDestinationPath", () => {
  it("Test 4 — defaults to workspace dashboard when next is absent", () => {
    const path = buildPostLoginDestinationPath(WORKSPACE_ID, null, [WORKSPACE_ID]);
    assert.equal(path, `/${WORKSPACE_ID}/dashboard`);
  });

  it("Test 10 — existing user with workspace keeps dashboard default", () => {
    const path = buildPostLoginDestinationPath(WORKSPACE_ID, "/start", [WORKSPACE_ID]);
    assert.equal(path, `/${WORKSPACE_ID}/dashboard`);
  });
});

describe("resolveAuthenticatedBootstrapFailureRedirect", () => {
  it("Test 5 — bootstrap failure routes to /start recovery", () => {
    assert.equal(
      resolveAuthenticatedBootstrapFailureRedirect(AUTH_WORKSPACE_SETUP_FAILED_MESSAGE),
      AUTH_WORKSPACE_RECOVERY_PATH
    );
  });

  it("does not treat unrelated errors as workspace recovery", () => {
    assert.equal(resolveAuthenticatedBootstrapFailureRedirect("Not authenticated"), null);
  });
});

describe("resolveAuthCallbackFailureRedirect", () => {
  it("Test 5 — authenticated bootstrap failure redirects to /start", () => {
    const url = resolveAuthCallbackFailureRedirect({
      origin: "https://arrexia.app",
      returnTo: "/login",
      errorMessage: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
      sessionEstablished: true,
    });

    assert.equal(url, "https://arrexia.app/start");
  });

  it("Test 6 — recovery callback remains on reset-password flow", () => {
    assert.equal(isPasswordRecoveryCallback("/reset-password"), true);

    const url = resolveAuthCallbackFailureRedirect({
      origin: "https://arrexia.app",
      returnTo: "/login",
      errorMessage: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
      sessionEstablished: false,
    });

    assert.match(url, /^https:\/\/arrexia\.app\/login\?error=/);
    assert.doesNotMatch(url, /\/start/);
  });

  it("Test 13 — avoids login error loop for authenticated workspace failures", () => {
    const recoveryUrl = resolveAuthCallbackFailureRedirect({
      origin: "https://arrexia.app",
      returnTo: "/login",
      errorMessage: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
      sessionEstablished: true,
    });

    assert.equal(recoveryUrl, "https://arrexia.app/start");
    assert.doesNotMatch(recoveryUrl, /\/login\?error=/);
  });
});

describe("zero-workspace recovery routing", () => {
  it("Test 9 — zero-workspace users resolve to dashboard via canonical bootstrap path", () => {
    const path = buildPostLoginDestinationPath(WORKSPACE_ID, null, [WORKSPACE_ID]);
    assert.equal(path, `/${WORKSPACE_ID}/dashboard`);
  });
});
