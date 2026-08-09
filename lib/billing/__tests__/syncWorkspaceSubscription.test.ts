import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_FREE_TRIAL_DAYS,
  buildSubscriptionUpsertPayload,
  MANUAL_BILLING_PERIOD_DAYS,
  type SyncWorkspaceSubscriptionResult,
} from "@/lib/billing/subscriptionSyncPayload";
import { syncWorkspaceSubscription } from "@/lib/billing/syncWorkspaceSubscription";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const EXISTING_TRIAL_END = "2026-08-09T12:00:00.000Z";

function expiredTrial(plan: "starter" | "pro"): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan,
    trialStartsAt: "2026-07-01T00:00:00.000Z",
    trialEndsAt: "2026-07-10T12:00:00.000Z",
    trialConsumedAt: "2026-07-01T00:00:00.000Z",
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

describe("syncWorkspaceSubscription payloads", () => {
  it("activate_paid sets active manual subscription with 30-day period", () => {
    const payload = buildSubscriptionUpsertPayload(
      "ws-1",
      "starter",
      "activate_paid",
      expiredTrial("starter"),
      NOW
    );
    assert.ok(payload);
    assert.equal(payload?.status, "active");
    assert.equal(payload?.payment_provider, "manual");
    assert.equal(payload?.trial_starts_at, "2026-07-01T00:00:00.000Z");
    assert.equal(payload?.trial_ends_at, "2026-07-10T12:00:00.000Z");
    assert.equal(payload?.current_period_starts_at, NOW.toISOString());
    const periodEnd = new Date(NOW);
    periodEnd.setDate(periodEnd.getDate() + MANUAL_BILLING_PERIOD_DAYS);
    assert.equal(payload?.current_period_ends_at, periodEnd.toISOString());
  });

  it("active_trial_plan_change preserves trial end date", () => {
    const existing = {
      status: "trial" as const,
      plan: "starter" as const,
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
    const expectedEnd = new Date(NOW);
    expectedEnd.setDate(expectedEnd.getDate() + ADMIN_FREE_TRIAL_DAYS);
    assert.equal(payload?.trial_ends_at, expectedEnd.toISOString());
  });
});

describe("syncWorkspaceSubscription", () => {
  it("returns sync_failed when upsert errors", async () => {
    const admin = {
      from() {
        return {
          upsert() {
            return Promise.resolve({
              error: { message: "upsert failed", code: "42501" },
            });
          },
        };
      },
    };

    const result = await syncWorkspaceSubscription(
      "ws-1",
      "starter",
      "activate_paid",
      null,
      admin as never,
      NOW
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "sync_failed");
    }
  });
});
