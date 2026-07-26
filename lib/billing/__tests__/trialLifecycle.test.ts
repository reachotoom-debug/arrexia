import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createPublicTrialSubscription } from "@/lib/billing/createPublicTrialSubscription";
import { resolveEffectiveWorkspacePlan } from "@/lib/billing/resolveEffectiveWorkspacePlan";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";
import { supabaseAdmin } from "@/lib/supabase/admin";

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

const NOW = new Date("2026-07-26T12:00:00.000Z");
const FUTURE_TRIAL_END = "2026-08-09T12:00:00.000Z";
const PAST_TRIAL_END = "2026-07-10T12:00:00.000Z";

function trialSubscription(
  plan: "starter" | "pro",
  trialEndsAt: string
): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan,
    trialStartsAt: "2026-07-26T12:00:00.000Z",
    trialEndsAt,
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

function activeSubscription(plan: "starter" | "pro"): WorkspaceSubscriptionSnapshot {
  return {
    status: "active",
    plan,
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStartsAt: "2026-01-01T00:00:00.000Z",
    currentPeriodEndsAt: "2027-01-01T00:00:00.000Z",
  };
}

type SubscriptionRow = {
  workspace_id: string;
  plan: string;
  status: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
};

function createSubscriptionMock(initial: SubscriptionRow[] = []) {
  const rows = [...initial];
  let insertShouldFail = false;

  function buildLookupBuilder(workspaceFilter: string | null) {
    return {
      select() {
        return this;
      },
      eq(_column: string, value: string) {
        workspaceFilter = value;
        return this;
      },
      maybeSingle() {
        const row = rows.find((entry) => entry.workspace_id === workspaceFilter) ?? null;
        return Promise.resolve({ data: row, error: null });
      },
      insert(row: Record<string, unknown>) {
        if (insertShouldFail) {
          return Promise.resolve({
            data: null,
            error: { message: "insert failed", code: "42501" },
          });
        }

        rows.push({
          workspace_id: String(row.workspace_id),
          plan: String(row.plan),
          status: String(row.status),
          trial_starts_at: (row.trial_starts_at as string | null) ?? null,
          trial_ends_at: (row.trial_ends_at as string | null) ?? null,
        });

        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  const admin = {
    from(_table: string) {
      return buildLookupBuilder(null);
    },
    setInsertShouldFail(value: boolean) {
      insertShouldFail = value;
    },
    getRows() {
      return rows;
    },
  };

  return admin;
}

describe("resolveEffectiveWorkspacePlan (R5 P3)", () => {
  it("A — active Starter trial grants Starter effective plan", () => {
    const result = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", FUTURE_TRIAL_END),
      NOW
    );
    assert.equal(result.effectivePlan, "starter");
    assert.equal(result.trial?.status, "active");
    assert.equal(result.entitlementSource, "active_trial");
  });

  it("B — active Pro trial grants Pro effective plan", () => {
    const result = resolveEffectiveWorkspacePlan(
      "pro",
      trialSubscription("pro", FUTURE_TRIAL_END),
      NOW
    );
    assert.equal(result.effectivePlan, "pro");
    assert.equal(result.trial?.trialPlan, "pro");
  });

  it("C — expired Starter trial falls back to Free", () => {
    const result = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", PAST_TRIAL_END),
      NOW
    );
    assert.equal(result.effectivePlan, "free");
    assert.equal(result.storedPlan, "starter");
    assert.equal(result.trial?.status, "expired");
    assert.equal(result.entitlementSource, "expired_trial");
  });

  it("D — expired Pro trial falls back to Free", () => {
    const result = resolveEffectiveWorkspacePlan(
      "pro",
      trialSubscription("pro", PAST_TRIAL_END),
      NOW
    );
    assert.equal(result.effectivePlan, "free");
    assert.equal(result.trial?.status, "expired");
  });

  it("E — active paid subscription is unaffected", () => {
    const result = resolveEffectiveWorkspacePlan("pro", activeSubscription("pro"), NOW);
    assert.equal(result.effectivePlan, "pro");
    assert.equal(result.entitlementSource, "paid_subscription");
    assert.equal(result.trial, null);
  });

  it("F — legacy workspace without subscription uses stored plan", () => {
    const result = resolveEffectiveWorkspacePlan("pro", null, NOW);
    assert.equal(result.effectivePlan, "pro");
    assert.equal(result.entitlementSource, "legacy_no_subscription");
  });

  it("G — retry does not change effective plan when subscription already exists", async () => {
    const admin = createSubscriptionMock([
      {
        workspace_id: "ws-1",
        plan: "starter",
        status: "trial",
        trial_starts_at: "2026-07-01T00:00:00.000Z",
        trial_ends_at: FUTURE_TRIAL_END,
      },
    ]);

    const first = await createPublicTrialSubscription(
      "ws-1",
      "pro",
      admin as unknown as SubscriptionAdmin
    );
    const second = await createPublicTrialSubscription(
      "ws-1",
      "pro",
      admin as unknown as SubscriptionAdmin
    );

    assert.equal(first.ok, true);
    assert.equal(first.created, false);
    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(admin.getRows().length, 1);
    assert.equal(admin.getRows()[0]?.trial_ends_at, FUTURE_TRIAL_END);
  });

  it("H — existing workspace URL retry cannot extend trial via insert-only subscription", async () => {
    const admin = createSubscriptionMock([
      {
        workspace_id: "ws-existing",
        plan: "starter",
        status: "trial",
        trial_starts_at: "2026-07-01T00:00:00.000Z",
        trial_ends_at: PAST_TRIAL_END,
      },
    ]);

    await createPublicTrialSubscription(
      "ws-existing",
      "pro",
      admin as unknown as SubscriptionAdmin
    );

    const result = resolveEffectiveWorkspacePlan(
      "starter",
      {
        status: "trial",
        plan: "starter",
        trialStartsAt: "2026-07-01T00:00:00.000Z",
        trialEndsAt: PAST_TRIAL_END,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
      },
      NOW
    );

    assert.equal(result.effectivePlan, "free");
    assert.equal(admin.getRows()[0]?.trial_ends_at, PAST_TRIAL_END);
  });

  it("I — failed subscription metadata creation must not grant indefinite paid entitlement at bootstrap", () => {
    const bootstrapSrc = readFileSync("lib/workspaces/ensureWorkspaceForUser.ts", "utf8");
    assert.match(bootstrapSrc, /if \(!subscriptionResult\.ok\)/);
    assert.match(bootstrapSrc, /revertWorkspacePlanToFree/);
  });

  it("J — usage above free limits uses effective free limits while stored plan remains", () => {
    const result = resolveEffectiveWorkspacePlan(
      "pro",
      trialSubscription("pro", PAST_TRIAL_END),
      NOW
    );
    assert.equal(result.effectivePlan, "free");
    assert.equal(result.storedPlan, "pro");
  });
});

describe("createPublicTrialSubscription", () => {
  it("creates trial metadata once", async () => {
    const admin = createSubscriptionMock();
    const result = await createPublicTrialSubscription(
      "ws-new",
      "starter",
      admin as unknown as SubscriptionAdmin
    );

    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(admin.getRows().length, 1);
    assert.equal(admin.getRows()[0]?.status, "trial");
    assert.ok(admin.getRows()[0]?.trial_ends_at);
  });

  it("returns insert_failed when subscription insert fails", async () => {
    const admin = createSubscriptionMock();
    admin.setInsertShouldFail(true);
    const result = await createPublicTrialSubscription(
      "ws-fail",
      "starter",
      admin as unknown as SubscriptionAdmin
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "insert_failed");
  });
});
