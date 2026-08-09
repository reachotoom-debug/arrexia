import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildAtomicWorkspacePlanRpcParams,
  executeAtomicWorkspacePlanChange,
  parseAtomicWorkspacePlanSnapshot,
  verifyAtomicWorkspacePlanSnapshot,
} from "@/lib/billing/atomicChangeWorkspacePlan";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "ws-atomic-test";
const NOW = new Date("2026-07-26T12:00:00.000Z");
const PAST_TRIAL_END = "2026-07-10T12:00:00.000Z";

describe("rpc_change_workspace_plan_atomic migration contract", () => {
  const migration = readFileSync(
    "supabase/migrations/20260806200000_rpc_change_workspace_plan_atomic.sql",
    "utf8"
  );

  it("uses SECURITY DEFINER with fixed search_path", () => {
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
  });

  it("locks workspace row with FOR UPDATE", () => {
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /FROM public\.workspaces w/);
  });

  it("rejects enterprise and accepts business in validation", () => {
    assert.match(
      migration,
      /p_target_plan NOT IN \('free', 'starter', 'pro', 'business'\)/
    );
    assert.doesNotMatch(migration, /'enterprise'/);
  });

  it("revokes anon/authenticated execute and grants service_role", () => {
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM authenticated/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  });

  it("returns required snapshot columns", () => {
    for (const column of [
      "workspace_id",
      "stored_plan",
      "subscription_plan",
      "subscription_status",
      "payment_provider",
      "trial_starts_at",
      "trial_ends_at",
      "current_period_starts_at",
      "current_period_ends_at",
      "cancel_at_period_end",
      "plan_updated_at",
      "subscription_updated_at",
    ]) {
      assert.match(migration, new RegExp(`'${column}'`));
    }
  });
});

describe("executeAtomicWorkspacePlanChange", () => {
  it("updates both tables on Free → Business", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);
    seedPlan(state, WORKSPACE_ID, "free");
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "business",
        syncMode: "activate_paid",
        existingSubscription: null,
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, true);
    assert.equal(state.plans[0]?.plan, "business");
    assert.equal(state.subscriptions[0]?.plan, "business");
    assert.equal(state.subscriptions[0]?.status, "active");
  });

  it("leaves both rows unchanged when RPC fails", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: "2027-01-01T00:00:00.000Z",
    });
    state.atomicRpcShouldFail = true;

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "pro",
        syncMode: "activate_paid",
        existingSubscription: null,
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, false);
    assert.equal(state.plans[0]?.plan, "starter");
    assert.equal(state.subscriptions[0]?.plan, "starter");
  });

  it("rejects missing workspace without mutating billing rows", async () => {
    const state = createBillingMockState();
    state.atomicRpcMissingWorkspace = true;

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "starter",
        syncMode: "activate_paid",
        existingSubscription: null,
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, false);
    assert.equal(state.plans.length, 0);
    assert.equal(state.subscriptions.length, 0);
  });

  it("rejects invalid enterprise plan values", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "enterprise" as "starter",
        syncMode: "activate_paid",
        existingSubscription: null,
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, false);
    assert.equal(state.plans.length, 0);
  });

  it("rejects returned snapshot mismatch", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);
    state.atomicRpcInvalidSnapshot = true;

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "starter",
        syncMode: "activate_paid",
        existingSubscription: null,
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "snapshot_mismatch");
    }
  });

  it("preserves trial end on active trial upgrade to Business", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "trial",
      trial_starts_at: "2026-07-12T12:00:00.000Z",
      trial_ends_at: "2026-08-09T12:00:00.000Z",
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "business",
        syncMode: "active_trial_plan_change",
        existingSubscription: {
          status: "trial",
          plan: "pro",
          trialStartsAt: "2026-07-12T12:00:00.000Z",
          trialEndsAt: "2026-08-09T12:00:00.000Z",
          trialConsumedAt: "2026-07-12T12:00:00.000Z",
          currentPeriodStartsAt: null,
          currentPeriodEndsAt: null,
        },
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, true);
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.trial_ends_at, "2026-08-09T12:00:00.000Z");
  });

  it("activates expired trial workspaces to paid Starter", async () => {
    const state = createBillingMockState();
    seedWorkspace(state, WORKSPACE_ID);
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await executeAtomicWorkspacePlanChange(
      {
        workspaceId: WORKSPACE_ID,
        targetPlan: "starter",
        syncMode: "activate_paid",
        existingSubscription: {
          status: "trial",
          plan: "starter",
          trialStartsAt: "2026-07-01T00:00:00.000Z",
          trialEndsAt: PAST_TRIAL_END,
          trialConsumedAt: "2026-07-01T00:00:00.000Z",
          currentPeriodStartsAt: null,
          currentPeriodEndsAt: null,
        },
        now: NOW,
      },
      createBillingMockAdmin(state)
    );

    assert.equal(result.ok, true);
    assert.equal(state.subscriptions[0]?.status, "active");
    assert.equal(state.subscriptions[0]?.trial_ends_at, PAST_TRIAL_END);
  });
});

describe("atomic snapshot helpers", () => {
  it("parses RPC snapshot payloads", () => {
    const parsed = parseAtomicWorkspacePlanSnapshot({
      workspace_id: WORKSPACE_ID,
      stored_plan: "business",
      subscription_plan: "business",
      subscription_status: "active",
      payment_provider: "manual",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: "2027-01-01T00:00:00.000Z",
      cancel_at_period_end: false,
      plan_updated_at: NOW.toISOString(),
      subscription_updated_at: NOW.toISOString(),
    });

    assert.ok(parsed);
    assert.equal(parsed?.stored_plan, "business");
  });

  it("builds RPC params from approved subscription payload", () => {
    const params = buildAtomicWorkspacePlanRpcParams({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      syncMode: "activate_paid",
      existingSubscription: null,
      now: NOW,
    });

    assert.ok(params);
    assert.equal(params?.p_target_plan, "pro");
    assert.equal(params?.p_subscription_status, "active");
  });

  it("verifyAtomicWorkspacePlanSnapshot enforces target/status match", () => {
    const snapshot = {
      workspace_id: WORKSPACE_ID,
      stored_plan: "pro" as const,
      subscription_plan: "pro" as const,
      subscription_status: "active" as const,
      payment_provider: "manual",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: "2027-01-01T00:00:00.000Z",
      cancel_at_period_end: false,
      plan_updated_at: NOW.toISOString(),
      subscription_updated_at: NOW.toISOString(),
    };

    assert.equal(verifyAtomicWorkspacePlanSnapshot(snapshot, "pro", "active"), true);
    assert.equal(verifyAtomicWorkspacePlanSnapshot(snapshot, "starter", "active"), false);
  });
});
