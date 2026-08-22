import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "./testSetup";

import {
  buildSubscriptionUpsertPayload,
  ADMIN_FREE_TRIAL_DAYS,
} from "@/lib/billing/subscriptionSyncPayload";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const EXISTING_TRIAL_END = "2026-08-09T12:00:00.000Z";

function expiredTrial(plan: "starter" | "pro"): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan,
    billingInterval: "monthly",
    trialStartsAt: "2026-07-01T00:00:00.000Z",
    trialEndsAt: "2026-07-10T12:00:00.000Z",
    trialConsumedAt: "2026-07-01T00:00:00.000Z",
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

describe("syncWorkspaceSubscription payloads", () => {
  it("activate_paid monthly sets active manual subscription with calendar-month period", () => {
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "starter",
      "activate_paid",
      expiredTrial("starter"),
      NOW,
      { billingInterval: "monthly" }
    );
    assert.ok(payload);
    assert.equal(payload?.status, "active");
    assert.equal(payload?.billing_interval, "monthly");
    assert.equal(payload?.payment_provider, "manual");
    assert.equal(payload?.current_period_starts_at, NOW.toISOString());
    assert.equal(payload?.current_period_ends_at, "2026-08-26T12:00:00.000Z");
  });

  it("activate_paid annual sets one calendar year period", () => {
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "pro",
      "activate_paid",
      expiredTrial("pro"),
      NOW,
      { billingInterval: "annual" }
    );
    assert.ok(payload);
    assert.equal(payload?.billing_interval, "annual");
    assert.equal(payload?.current_period_ends_at, "2027-07-26T12:00:00.000Z");
  });

  it("activate_paid defaults to monthly when interval omitted", () => {
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "business",
      "activate_paid",
      expiredTrial("starter"),
      NOW
    );
    assert.ok(payload);
    assert.equal(payload?.billing_interval, "monthly");
    assert.equal(payload?.current_period_ends_at, "2026-08-26T12:00:00.000Z");
  });

  it("active_trial_plan_change preserves trial end date", () => {
    const existing = {
      status: "trial" as const,
      plan: "starter" as const,
      billingInterval: "monthly" as const,
      trialStartsAt: "2026-07-12T12:00:00.000Z",
      trialEndsAt: EXISTING_TRIAL_END,
      trialConsumedAt: "2026-07-12T12:00:00.000Z",
      currentPeriodStartsAt: null,
      currentPeriodEndsAt: null,
    };
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "pro",
      "active_trial_plan_change",
      existing,
      NOW
    );
    assert.ok(payload);
    assert.equal(payload?.status, "trial");
    assert.equal(payload?.plan, "pro");
    assert.equal(payload?.trial_ends_at, EXISTING_TRIAL_END);
  });

  it("admin_free creates a fresh 14-day trial window", () => {
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "free",
      "admin_free",
      null,
      NOW
    );
    assert.ok(payload);
    assert.equal(payload?.status, "trial");
    assert.equal(payload?.plan, "free");
    assert.equal(payload?.billing_interval, "monthly");
    const expectedEnd = new Date(NOW);
    expectedEnd.setDate(expectedEnd.getDate() + ADMIN_FREE_TRIAL_DAYS);
    assert.equal(payload?.trial_ends_at, expectedEnd.toISOString());
  });
});
