import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBillingPlanCardCta } from "@/lib/billing/billingPlanCardCta";
import { createArrexiaTrialSubscription } from "@/lib/billing/createPublicTrialSubscription";
import {
  assertAutomatedReminderExecutionEntitlement,
  assertClientCreateEntitlement,
  assertImportEntitlement,
} from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";
import {
  resolveBootstrapWorkspacePlan,
  parseSignupMarketingPlanIntent,
} from "@/lib/billing/publicTrialPlan";
import { resolveEffectiveWorkspacePlan } from "@/lib/billing/resolveEffectiveWorkspacePlan";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import {
  TRIAL_AI_GENERATION_LIMIT,
  TRIAL_AUTOMATED_REMINDER_LIMIT,
  TRIAL_CLIENT_LIMIT,
  TRIAL_DURATION_DAYS,
  TRIAL_INVOICE_LIMIT_TOTAL,
  TRIAL_MANUAL_EMAIL_REMINDER_LIMIT,
  computeTrialEndsAt,
} from "@/lib/billing/trialConfig";
import {
  getRemainingTrialUsage,
  isTrialUsageExhausted,
  type EntitlementUsageSnapshot,
} from "@/lib/billing/usageMetering";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";
import { trialHref } from "@/lib/billing/plans";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = computeTrialEndsAt(NOW);
const PAST = "2026-07-01T00:00:00.000Z";

function legacyTrial(plan: "starter" | "pro" | "business"): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan,
    trialStartsAt: NOW.toISOString(),
    trialEndsAt: FUTURE,
    trialConsumedAt: NOW.toISOString(),
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

function standaloneTrial(): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan: "free",
    trialStartsAt: NOW.toISOString(),
    trialEndsAt: FUTURE,
    trialConsumedAt: NOW.toISOString(),
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

function paid(plan: "starter" | "pro" | "business"): WorkspaceSubscriptionSnapshot {
  return {
    status: "active",
    plan,
    trialStartsAt: NOW.toISOString(),
    trialEndsAt: FUTURE,
    trialConsumedAt: NOW.toISOString(),
    currentPeriodStartsAt: "2026-01-01T00:00:00.000Z",
    currentPeriodEndsAt: "2027-01-01T00:00:00.000Z",
  };
}

function usage(partial: Partial<EntitlementUsageSnapshot>): EntitlementUsageSnapshot {
  return {
    workspace_id: "ws-1",
    trial_invoices_created: 0,
    ai_generations_successful: 0,
    automated_reminders_sent: 0,
    manual_email_reminders_sent: 0,
    ...partial,
  };
}

describe("standalone trial configuration", () => {
  it("uses central 14-day duration", () => {
    assert.equal(TRIAL_DURATION_DAYS, 14);
    assert.equal(
      computeTrialEndsAt(new Date("2026-08-01T00:00:00.000Z")),
      new Date("2026-08-15T00:00:00.000Z").toISOString()
    );
  });

  it("defines trial limits", () => {
    assert.equal(TRIAL_CLIENT_LIMIT, 50);
    assert.equal(TRIAL_INVOICE_LIMIT_TOTAL, 75);
    assert.equal(TRIAL_AI_GENERATION_LIMIT, 50);
    assert.equal(TRIAL_AUTOMATED_REMINDER_LIMIT, 75);
    assert.equal(TRIAL_MANUAL_EMAIL_REMINDER_LIMIT, 75);
  });
});

describe("signup bootstrap", () => {
  it("maps all marketing intents to the same bootstrap plan", () => {
    assert.equal(resolveBootstrapWorkspacePlan("starter"), "free");
    assert.equal(resolveBootstrapWorkspacePlan("pro"), "free");
    assert.equal(resolveBootstrapWorkspacePlan("business"), "free");
    assert.equal(resolveBootstrapWorkspacePlan(null), "free");
  });

  it("retains marketing intent without granting entitlement", () => {
    assert.equal(parseSignupMarketingPlanIntent("starter"), "starter");
    assert.equal(parseSignupMarketingPlanIntent("business"), "business");
  });

  it("preserves marketing href params without changing bootstrap", () => {
    assert.equal(trialHref("starter"), "/register?plan=starter");
    assert.equal(trialHref("pro"), "/register?plan=pro");
    assert.equal(trialHref("business"), "/register?plan=business");
  });
});

describe("resolveWorkspaceEntitlement", () => {
  it("active standalone trial resolves as trial with null paid plan", () => {
    const e = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: standaloneTrial(),
      now: NOW,
    });
    assert.equal(e.state, "trial");
    assert.equal(e.paidPlan, null);
    assert.equal(e.plan, "free");
    assert.equal(e.trialActive, true);
    assert.equal(e.clientLimit, TRIAL_CLIENT_LIMIT);
    assert.equal(e.trialInvoiceLimitTotal, TRIAL_INVOICE_LIMIT_TOTAL);
  });

  it("legacy trial+starter resolves as standalone trial", () => {
    const e = resolveWorkspaceEntitlement({
      storedPlan: "starter",
      subscription: legacyTrial("starter"),
      now: NOW,
    });
    assert.equal(e.state, "trial");
    assert.equal(e.paidPlan, null);
    assert.equal(e.plan, "free");
  });

  it("legacy trial+pro and trial+business resolve as standalone trial", () => {
    for (const plan of ["pro", "business"] as const) {
      const e = resolveWorkspaceEntitlement({
        storedPlan: plan,
        subscription: legacyTrial(plan),
        now: NOW,
      });
      assert.equal(e.state, "trial");
      assert.equal(e.paidPlan, null);
    }
  });

  it("expired trial is read-only", () => {
    const e = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: {
        ...standaloneTrial(),
        trialEndsAt: PAST,
      },
      now: NOW,
    });
    assert.equal(e.state, "trial_expired");
    assert.equal(e.canMutate, false);
    assert.equal(e.trialExpired, true);
  });

  it("active paid plans remain unchanged", () => {
    for (const plan of ["starter", "pro", "business"] as const) {
      const e = resolveWorkspaceEntitlement({
        storedPlan: plan,
        subscription: paid(plan),
        now: NOW,
        paidLimits: { clientLimit: 25, invoiceLimitMonthly: 50, workspaceMemberLimit: 1 },
      });
      assert.equal(e.state, "paid");
      assert.equal(e.paidPlan, plan);
      assert.equal(e.canMutate, true);
    }
  });

  it("trial expiry occurs exactly at trial_ends_at boundary", () => {
    const atEnd = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: {
        ...standaloneTrial(),
        trialEndsAt: NOW.toISOString(),
      },
      now: NOW,
    });
    assert.equal(atEnd.state, "trial_expired");
  });
});

describe("resolveEffectiveWorkspacePlan adapter", () => {
  it("does not map active trial to starter/pro/business", () => {
    const starterLegacy = resolveEffectiveWorkspacePlan(
      "starter",
      legacyTrial("starter"),
      NOW
    );
    assert.equal(starterLegacy.effectivePlan, "free");
    assert.equal(starterLegacy.entitlementSource, "active_trial");

    const proLegacy = resolveEffectiveWorkspacePlan("pro", legacyTrial("pro"), NOW);
    assert.equal(proLegacy.effectivePlan, "free");
  });

  it("expired legacy trial falls back to free effective plan", () => {
    const result = resolveEffectiveWorkspacePlan(
      "pro",
      { ...legacyTrial("pro"), trialEndsAt: PAST },
      NOW
    );
    assert.equal(result.effectivePlan, "free");
    assert.equal(result.entitlementSource, "expired_trial");
  });
});

describe("trial usage metering semantics", () => {
  it("invoice #75 succeeds and #76 blocked", () => {
    const at75 = usage({ trial_invoices_created: 74 });
    assert.equal(isTrialUsageExhausted(at75, "trial_invoices"), false);
    assert.equal(getRemainingTrialUsage(at75, "trial_invoices"), 1);
    const at76 = usage({ trial_invoices_created: 75 });
    assert.equal(isTrialUsageExhausted(at76, "trial_invoices"), true);
  });

  it("AI generation #50 succeeds and #51 blocked", () => {
    assert.equal(isTrialUsageExhausted(usage({ ai_generations_successful: 49 }), "ai_generations"), false);
    assert.equal(isTrialUsageExhausted(usage({ ai_generations_successful: 50 }), "ai_generations"), true);
  });

  it("manual and automated reminder limits are total trial counters", () => {
    assert.equal(
      isTrialUsageExhausted(usage({ manual_email_reminders_sent: 75 }), "manual_email_reminders"),
      true
    );
    assert.equal(
      isTrialUsageExhausted(usage({ automated_reminders_sent: 75 }), "automated_reminders"),
      true
    );
  });
});

describe("billing CTA semantics", () => {
  it("trial CTAs select paid plans", () => {
    const ctx = { entitlementState: "trial" as const, paidPlan: null };
    assert.equal(getBillingPlanCardCta(ctx, "starter").label, "Select Starter");
    assert.equal(getBillingPlanCardCta(ctx, "business").canSubmit, true);
  });

  it("paid downgrade CTAs are disabled with support message", () => {
    const ctx = { entitlementState: "paid" as const, paidPlan: "business" as const };
    const cta = getBillingPlanCardCta(ctx, "pro");
    assert.equal(cta.label, "Select plan");
    assert.equal(cta.disabled, true);
    assert.match(cta.disabledReason ?? "", /support/i);
  });

  it("current paid plan is disabled", () => {
    const ctx = { entitlementState: "paid" as const, paidPlan: "pro" as const };
    const cta = getBillingPlanCardCta(ctx, "pro");
    assert.equal(cta.label, "Current plan");
    assert.equal(cta.disabled, true);
  });
});

describe("createArrexiaTrialSubscription one-trial guarantee", () => {
  type Row = {
    workspace_id: string;
    plan: string;
    status: string;
    trial_starts_at: string | null;
    trial_ends_at: string | null;
    trial_consumed_at?: string | null;
  };

  function mockAdmin(initial: Row[] = [], workspaceTrialConsumedAt: string | null = null) {
    const rows = [...initial];
    const workspaces = new Map<string, { trial_consumed_at: string | null }>();
    return {
      from(table: string) {
        let workspaceFilter: string | null = null;
        let updatePatch: Record<string, unknown> | null = null;
        let updateIsNullColumn: string | null = null;
        return {
          select() {
            return this;
          },
          eq(_c: string, value: string) {
            workspaceFilter = value;
            return this;
          },
          is(column: string, value: unknown) {
            if (value === null) {
              updateIsNullColumn = column;
            }
            return this;
          },
          update(patch: Record<string, unknown>) {
            updatePatch = patch;
            return this;
          },
          maybeSingle() {
            if (table === "workspaces") {
              const existing = workspaceFilter
                ? workspaces.get(workspaceFilter)
                : undefined;
              return Promise.resolve({
                data: {
                  trial_consumed_at:
                    existing?.trial_consumed_at ?? workspaceTrialConsumedAt,
                },
                error: null,
              });
            }
            const row = rows.find((r) => r.workspace_id === workspaceFilter) ?? null;
            return Promise.resolve({ data: row, error: null });
          },
          insert(row: Record<string, unknown>) {
            if (table === "workspace_subscriptions") {
              rows.push({
                workspace_id: String(row.workspace_id),
                plan: String(row.plan),
                status: String(row.status),
                trial_starts_at: (row.trial_starts_at as string | null) ?? null,
                trial_ends_at: (row.trial_ends_at as string | null) ?? null,
                trial_consumed_at: (row.trial_consumed_at as string | null) ?? null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then(onfulfilled?: (value: unknown) => unknown) {
            if (table === "workspaces" && updatePatch && workspaceFilter) {
              const current = workspaces.get(workspaceFilter) ?? {
                trial_consumed_at: workspaceTrialConsumedAt,
              };
              if (
                !updateIsNullColumn ||
                current.trial_consumed_at === null
              ) {
                workspaces.set(workspaceFilter, {
                  trial_consumed_at:
                    (updatePatch.trial_consumed_at as string | null | undefined) ??
                    current.trial_consumed_at,
                });
              }
            }
            return Promise.resolve({ data: null, error: null }).then(onfulfilled);
          },
        };
      },
      getRows: () => rows,
      getWorkspaceTrialConsumedAt: (workspaceId: string) =>
        workspaces.get(workspaceId)?.trial_consumed_at ?? workspaceTrialConsumedAt,
    };
  }

  it("creates standalone free-plan trial once", async () => {
    const admin = mockAdmin();
    const first = await createArrexiaTrialSubscription("ws-1", admin as never, NOW);
    const second = await createArrexiaTrialSubscription("ws-1", admin as never, NOW);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.created, true);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.created, false);
    assert.equal(admin.getRows().length, 1);
    assert.equal(admin.getRows()[0]?.plan, "free");
    assert.ok(admin.getRows()[0]?.trial_consumed_at);
  });

  it("does not recreate trial for legacy consumed row", async () => {
    const admin = mockAdmin([
      {
        workspace_id: "ws-legacy",
        plan: "starter",
        status: "trial",
        trial_starts_at: PAST,
        trial_ends_at: PAST,
        trial_consumed_at: PAST,
      },
    ]);
    const result = await createArrexiaTrialSubscription("ws-legacy", admin as never, NOW);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.created, false);
    assert.equal(admin.getRows().length, 1);
  });

  it("does not recreate trial when durable workspace marker exists without subscription row", async () => {
    const admin = mockAdmin([], PAST);
    const result = await createArrexiaTrialSubscription("ws-durable", admin as never, NOW);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.created, false);
    assert.equal(admin.getRows().length, 0);
  });
});

describe("entitlement guard contracts (module exports)", () => {
  it("exports centralized mutation guard helpers", () => {
    assert.equal(typeof assertClientCreateEntitlement, "function");
    assert.equal(typeof assertImportEntitlement, "function");
    assert.equal(typeof assertAutomatedReminderExecutionEntitlement, "function");
  });

  it("EntitlementError exposes stable codes", () => {
    const error = new EntitlementError("TRIAL_EXPIRED", "expired");
    assert.equal(error.code, "TRIAL_EXPIRED");
    assert.equal(error.name, "EntitlementError");
  });
});
