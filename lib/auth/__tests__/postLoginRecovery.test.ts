import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "../authErrors";
import { isPasswordRecoveryCallback } from "../passwordRecovery";
import {
  AUTH_WORKSPACE_RECOVERY_PATH,
  buildPostLoginDestinationPath,
  buildWorkspaceRecoveryPath,
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

describe("buildWorkspaceRecoveryPath", () => {
  it("preserves allowlisted starter trial intent", () => {
    assert.equal(
      buildWorkspaceRecoveryPath({ initialTrialPlan: "starter" }),
      "/start?plan=starter"
    );
  });

  it("preserves allowlisted pro trial intent", () => {
    assert.equal(buildWorkspaceRecoveryPath({ initialTrialPlan: "pro" }), "/start?plan=pro");
  });

  it("preserves safe next path with trial intent", () => {
    const path = buildWorkspaceRecoveryPath({
      initialTrialPlan: "starter",
      nextPath: `/${WORKSPACE_ID}/dashboard`,
    });
    assert.equal(path, `/start?plan=starter&next=%2F${WORKSPACE_ID}%2Fdashboard`);
  });

  it("rejects unsafe next paths", () => {
    assert.equal(
      buildWorkspaceRecoveryPath({
        initialTrialPlan: "pro",
        nextPath: "https://evil.example/phish",
      }),
      "/start?plan=pro"
    );
  });

  it("generic recovery remains /start without plan", () => {
    assert.equal(buildWorkspaceRecoveryPath(), AUTH_WORKSPACE_RECOVERY_PATH);
  });
});

describe("resolveAuthenticatedBootstrapFailureRedirect", () => {
  it("Test 5 — bootstrap failure routes to /start recovery", () => {
    assert.equal(
      resolveAuthenticatedBootstrapFailureRedirect(AUTH_WORKSPACE_SETUP_FAILED_MESSAGE),
      AUTH_WORKSPACE_RECOVERY_PATH
    );
  });

  it("preserves starter trial intent on bootstrap recovery", () => {
    assert.equal(
      resolveAuthenticatedBootstrapFailureRedirect(AUTH_WORKSPACE_SETUP_FAILED_MESSAGE, {
        initialTrialPlan: "starter",
      }),
      "/start?plan=starter"
    );
  });

  it("preserves pro trial intent on bootstrap recovery", () => {
    assert.equal(
      resolveAuthenticatedBootstrapFailureRedirect(AUTH_WORKSPACE_SETUP_FAILED_MESSAGE, {
        initialTrialPlan: "pro",
      }),
      "/start?plan=pro"
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

  it("starter bootstrap failure recovery URL preserves plan=starter", () => {
    const recoveryUrl = resolveAuthCallbackFailureRedirect({
      origin: "https://arrexia.app",
      returnTo: "/login",
      errorMessage: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
      sessionEstablished: true,
      initialTrialPlan: "starter",
    });

    assert.equal(recoveryUrl, "https://arrexia.app/start?plan=starter");
  });

  it("pro bootstrap failure recovery URL preserves plan=pro", () => {
    const recoveryUrl = resolveAuthCallbackFailureRedirect({
      origin: "https://arrexia.app",
      returnTo: "/register",
      errorMessage: AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
      sessionEstablished: true,
      initialTrialPlan: "pro",
      nextPath: `/${WORKSPACE_ID}/dashboard`,
    });

    assert.equal(
      recoveryUrl,
      `https://arrexia.app/start?plan=pro&next=%2F${WORKSPACE_ID}%2Fdashboard`
    );
  });
});

describe("zero-workspace recovery routing", () => {
  it("Test 9 — zero-workspace users resolve to dashboard via canonical bootstrap path", () => {
    const path = buildPostLoginDestinationPath(WORKSPACE_ID, null, [WORKSPACE_ID]);
    assert.equal(path, `/${WORKSPACE_ID}/dashboard`);
  });
});
