import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import "@/lib/billing/__tests__/testSetup";

import {
  extendWorkspaceTrial,
  PAID_TRIAL_EXTENSION_BLOCKED_MESSAGE,
} from "@/lib/admin/extendWorkspaceTrial";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "@/lib/billing/__tests__/billingMutationMock";

const WORKSPACE_ID = "ws-trial-extend-guard";
const NOW = new Date("2026-07-26T12:00:00.000Z");
const FUTURE_TRIAL_END = "2026-08-09T12:00:00.000Z";
const PAST_TRIAL_END = "2026-07-10T12:00:00.000Z";
const EXTEND_DAYS = 7;

function installMock(state = createBillingMockState()) {
  seedWorkspace(state, WORKSPACE_ID);
  const admin = createBillingMockAdmin(state);
  setSupabaseAdminClientForTests(admin);
  return { state, admin };
}

function seedActivePaidSubscription(
  state: ReturnType<typeof createBillingMockState>,
  plan: "starter" | "pro" | "business",
  status: "active" | "past_due" = "active"
) {
  seedPlan(state, WORKSPACE_ID, plan);
  seedSubscription(state, WORKSPACE_ID, {
    plan,
    status,
    trial_starts_at: "2026-07-01T00:00:00.000Z",
    trial_ends_at: PAST_TRIAL_END,
    current_period_starts_at: NOW.toISOString(),
    current_period_ends_at: FUTURE_TRIAL_END,
  });
}

afterEach(() => {
  setSupabaseAdminClientForTests(null);
});

describe("extendWorkspaceTrial paid guard", () => {
  for (const plan of ["starter", "pro", "business"] as const) {
    it(`A — active paid ${plan} → extension blocked`, async () => {
      const { state, admin } = installMock();
      seedActivePaidSubscription(state, plan);

      const result = await extendWorkspaceTrial(WORKSPACE_ID, EXTEND_DAYS, admin);

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error, PAID_TRIAL_EXTENSION_BLOCKED_MESSAGE);
      }
      assert.equal(state.subscriptions[0]?.status, "active");
      assert.equal(state.subscriptions[0]?.trial_ends_at, PAST_TRIAL_END);
    });
  }

  it("D — past_due paid Pro → extension blocked", async () => {
    const { state, admin } = installMock();
    seedActivePaidSubscription(state, "pro", "past_due");

    const result = await extendWorkspaceTrial(WORKSPACE_ID, EXTEND_DAYS, admin);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, PAID_TRIAL_EXTENSION_BLOCKED_MESSAGE);
    }
    assert.equal(state.subscriptions[0]?.status, "past_due");
  });

  it("E — active trial → extension still allowed", async () => {
    const { state, admin } = installMock();
    seedPlan(state, WORKSPACE_ID, "free");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "free",
      status: "trial",
      trial_starts_at: "2026-07-12T12:00:00.000Z",
      trial_ends_at: FUTURE_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await extendWorkspaceTrial(WORKSPACE_ID, EXTEND_DAYS, admin);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.trialEndsAt, "2026-08-16T12:00:00.000Z");
    }
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.trial_ends_at, "2026-08-16T12:00:00.000Z");
  });

  it("F — expired trial → extension still allowed", async () => {
    const { state, admin } = installMock();
    seedPlan(state, WORKSPACE_ID, "free");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "free",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await extendWorkspaceTrial(WORKSPACE_ID, EXTEND_DAYS, admin);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.trialEndsAt, "2026-07-17T12:00:00.000Z");
    }
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.trial_ends_at, "2026-07-17T12:00:00.000Z");
  });

  it("G — paid rejection occurs before subscription mutation", async () => {
    const { state, admin } = installMock();
    seedActivePaidSubscription(state, "starter");
    const before = structuredClone(state.subscriptions[0]);

    const result = await extendWorkspaceTrial(WORKSPACE_ID, EXTEND_DAYS, admin);

    assert.equal(result.ok, false);
    assert.deepEqual(state.subscriptions[0], before);
  });
});

describe("extendWorkspaceTrialAction authorization contracts", () => {
  it("H — admin action requires assertAdmin and full admin access", () => {
    const src = readFileSync("app/admin/actions.ts", "utf8");
    assert.match(src, /export async function extendWorkspaceTrialAction/);
    assert.match(src, /await assertAdmin\(\)/);
    assert.match(src, /canAccessFullAdmin/);
    assert.match(src, /extendWorkspaceTrial\(/);
  });

  it("I — trial extension does not route through plan change or renewal actions", () => {
    const extendSrc = readFileSync("lib/admin/extendWorkspaceTrial.ts", "utf8");
    const actionsSrc = readFileSync("app/admin/actions.ts", "utf8");

    assert.doesNotMatch(extendSrc, /changeWorkspacePlan/);
    assert.doesNotMatch(extendSrc, /markWorkspaceRenewedAction/);
    assert.doesNotMatch(extendSrc, /rpc_change_workspace_plan_atomic/);
    assert.match(extendSrc, /getWorkspaceEntitlementState/);
    assert.doesNotMatch(
      actionsSrc,
      /extendWorkspaceTrialAction[\s\S]*changeWorkspacePlan/
    );
  });
});
