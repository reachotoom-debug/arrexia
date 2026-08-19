import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import "./testSetup";

import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_A = "ws-plan-cache-a";
const WORKSPACE_B = "ws-plan-cache-b";

function installMock() {
  const state = createBillingMockState();
  seedWorkspace(state, WORKSPACE_A);
  seedWorkspace(state, WORKSPACE_B);
  seedPlan(state, WORKSPACE_A, "starter");
  seedPlan(state, WORKSPACE_B, "pro");
  setSupabaseAdminClientForTests(createBillingMockAdmin(state));
  return state;
}

afterEach(() => {
  setSupabaseAdminClientForTests(null);
});

describe("getWorkspacePlan request cache", () => {
  it("uses React cache() with workspaceId as the memo key input", () => {
    const src = readFileSync("lib/billing/getWorkspacePlan.ts", "utf8");
    assert.match(src, /export const getWorkspacePlan = cache\(loadWorkspacePlanUncached\)/);
    assert.match(src, /async function loadWorkspacePlanUncached\(\s*workspaceId: string/);
    assert.doesNotMatch(src, /unstable_cache/);
    assert.doesNotMatch(src, /revalidate/);
  });

  it("preserves entitlement resolver delegation and return contract", () => {
    const src = readFileSync("lib/billing/getWorkspacePlan.ts", "utf8");
    assert.match(src, /getWorkspaceEntitlementForBilling\(workspaceId\)/);
    assert.match(src, /entitlement:\s*billing\.entitlement/);
    assert.match(src, /invoiceLimitMonthly:\s*billing\.invoiceLimitMonthly/);
    assert.match(src, /trial:\s*billing\.trial/);
  });

  it("returns isolated plan results per workspaceId", async () => {
    installMock();

    const [planA, planB] = await Promise.all([
      getWorkspacePlan(WORKSPACE_A),
      getWorkspacePlan(WORKSPACE_B),
    ]);

    assert.equal(planA.plan, "starter");
    assert.equal(planA.storedPlan, "starter");
    assert.equal(planB.plan, "pro");
    assert.equal(planB.storedPlan, "pro");
    assert.notEqual(planA.plan, planB.plan);
  });

  it("preserves billing semantics for trial workspace", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_A, "free");
    seedSubscription(state, WORKSPACE_A, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-08-01T12:00:00.000Z",
      trial_ends_at: "2026-09-30T12:00:00.000Z",
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const plan = await getWorkspacePlan(WORKSPACE_A);
    assert.equal(plan.entitlement.state, "trial");
    assert.equal(plan.plan, "free");
    assert.ok(plan.trial);
  });
});
