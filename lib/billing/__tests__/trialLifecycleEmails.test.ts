import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import { createArrexiaTrialSubscription } from "@/lib/billing/createPublicTrialSubscription";
import { pickEarliestOwnerMember } from "@/lib/billing/getWorkspaceOwnerEmail";
import { deliverTrialLifecycleEmail } from "@/lib/billing/trialLifecycleDelivery";
import {
  computeDaysSinceTrialEnd,
  computeTrialDaysRemaining,
  getEligibleTrialLifecycleEvents,
  isTrialExpiredEligible,
  isTrialExpiredPlusSevenEligible,
  isTrialExpiredPlusThreeEligible,
  isTrialOneDayRemainingEligible,
  isTrialSevenDayRemainingEligible,
  isTrialStartedEligible,
  isTrialThreeDayRemainingEligible,
  selectTrialLifecycleEventForRun,
  TRIAL_STARTED_BACKFILL_MAX_DAYS,
} from "@/lib/billing/trialLifecycleEligibility";
import {
  acquireTrialLifecycleSendSlot,
  markTrialLifecycleEventFailed,
  markTrialLifecycleEventSent,
  TRIAL_LIFECYCLE_PENDING_STALE_MS,
  type TrialLifecycleEventKey,
  type TrialLifecycleEventMetadata,
} from "@/lib/billing/trialLifecycleEvents";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import { computeTrialEndsAt, TRIAL_DURATION_DAYS } from "@/lib/billing/trialConfig";
import {
  renderTrialExpiredEmail,
  renderTrialLifecycleEmail,
  renderTrialLifecycleGreeting,
  renderTrialStartedEmail,
} from "@/lib/email/templates";
import { verifyCronReminderAuth } from "@/lib/reminders/cronAuth";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const TRIAL_END = computeTrialEndsAt(NOW);

function activeTrialSubscription(trialEndsAt: string = TRIAL_END): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan: "free",
    trialStartsAt: NOW.toISOString(),
    trialEndsAt,
    trialConsumedAt: NOW.toISOString(),
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

function expiredTrialSubscription(trialEndsAt: string): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan: "free",
    trialStartsAt: "2026-07-01T00:00:00.000Z",
    trialEndsAt,
    trialConsumedAt: "2026-07-01T00:00:00.000Z",
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

type LifecycleEventRow = {
  id: string;
  workspace_id: string;
  event_key: TrialLifecycleEventKey;
  sent_at: string;
  metadata: TrialLifecycleEventMetadata | null;
};

function createLifecycleEventsMock(initial: LifecycleEventRow[] = []) {
  const rows = [...initial];
  let idCounter = 1;

  function findRow(workspaceId: string, eventKey: TrialLifecycleEventKey) {
    return rows.find((row) => row.workspace_id === workspaceId && row.event_key === eventKey) ?? null;
  }

  const admin = {
    from(table: string) {
      if (table !== "workspace_trial_lifecycle_events") {
        throw new Error(`Unexpected table ${table}`);
      }

      let workspaceFilter: string | null = null;
      let eventFilter: TrialLifecycleEventKey | null = null;
      let idFilter: string | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      let eqCount = 0;
      const filters: Array<{ path: string; op: string; value: string | null }> = [];
      let metadataIsNull = false;

      function rowMatchesReclaimFilters(row: LifecycleEventRow): boolean {
        if (metadataIsNull) {
          return row.metadata == null;
        }
        for (const filter of filters) {
          if (filter.path === "metadata->>status") {
            if (row.metadata?.status !== filter.value) {
              return false;
            }
          }
          if (filter.path === "metadata->>lastAttemptAt") {
            if (row.metadata?.lastAttemptAt !== filter.value) {
              return false;
            }
          }
        }
        return true;
      }

      function applyUpdate() {
        const row =
          idFilter != null
            ? rows.find((candidate) => candidate.id === idFilter) ?? null
            : workspaceFilter && eventFilter
              ? findRow(workspaceFilter, eventFilter)
              : null;
        if (!row || !rowMatchesReclaimFilters(row)) {
          return { data: null, error: null };
        }
        if (updatePayload?.metadata) {
          row.metadata = updatePayload.metadata as TrialLifecycleEventMetadata;
        }
        if (typeof updatePayload?.sent_at === "string") {
          row.sent_at = updatePayload.sent_at;
        }
        return { data: { id: row.id }, error: null };
      }

      const builder = {
        select() {
          return builder;
        },
        filter(path: string, op: string, value: string) {
          filters.push({ path, op, value });
          return builder;
        },
        is(column: string, value: unknown) {
          if (column === "metadata" && value === null) {
            metadataIsNull = true;
          }
          return builder;
        },
        eq(column: string, value: string) {
          eqCount += 1;
          if (column === "workspace_id") workspaceFilter = value;
          if (column === "event_key") eventFilter = value as TrialLifecycleEventKey;
          if (column === "id") idFilter = value;
          return builder;
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          if (updatePayload && workspaceFilter && eventFilter) {
            applyUpdate();
            return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
        },
        insert(payload: Record<string, unknown>) {
          insertPayload = payload;
          return builder;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          eqCount = 0;
          filters.length = 0;
          metadataIsNull = false;
          return builder;
        },
        upsert(payload: Record<string, unknown>) {
          const workspaceId = String(payload.workspace_id);
          const eventKey = payload.event_key as TrialLifecycleEventKey;
          const existing = findRow(workspaceId, eventKey);
          if (existing) {
            existing.metadata = (payload.metadata as TrialLifecycleEventMetadata | null) ?? null;
            existing.sent_at = String(payload.sent_at ?? existing.sent_at);
            return Promise.resolve({ error: null });
          }
          rows.push({
            id: `row-${idCounter++}`,
            workspace_id: workspaceId,
            event_key: eventKey,
            sent_at: String(payload.sent_at ?? new Date().toISOString()),
            metadata: (payload.metadata as TrialLifecycleEventMetadata | null) ?? null,
          });
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          if (insertPayload) {
            const workspaceId = String(insertPayload.workspace_id);
            const eventKey = insertPayload.event_key as TrialLifecycleEventKey;
            if (findRow(workspaceId, eventKey)) {
              return Promise.resolve({
                data: null,
                error: { code: "23505", message: "duplicate key value" },
              });
            }
            const row: LifecycleEventRow = {
              id: `row-${idCounter++}`,
              workspace_id: workspaceId,
              event_key: eventKey,
              sent_at: new Date().toISOString(),
              metadata: (insertPayload.metadata as TrialLifecycleEventMetadata | null) ?? null,
            };
            rows.push(row);
            return Promise.resolve({ data: { id: row.id }, error: null });
          }

          if (updatePayload) {
            return Promise.resolve(applyUpdate());
          }

          const row =
            workspaceFilter && eventFilter ? findRow(workspaceFilter, eventFilter) : null;
          return Promise.resolve({ data: row, error: null });
        },
      };

      return builder;
    },
  };

  return { admin, rows };
}

function entitlementFromSubscription(
  subscription: WorkspaceSubscriptionSnapshot,
  now: Date = NOW
) {
  return resolveWorkspaceEntitlement({
    storedPlan: "free",
    subscription,
    now,
  });
}

describe("trial lifecycle eligibility windows", () => {
  it("A — trial_started eligible once for active trial", () => {
    const entitlement = entitlementFromSubscription(activeTrialSubscription());
    assert.equal(isTrialStartedEligible(entitlement.state, TRIAL_END, NOW), true);
    assert.deepEqual(getEligibleTrialLifecycleEvents(entitlement, TRIAL_END, NOW), [
      "trial_started",
    ]);
  });

  it("B — 7-day event eligible in catch-up band", () => {
    const sevenDaysOut = "2026-08-08T12:00:00.000Z";
    const atSeven = new Date("2026-08-01T12:00:00.000Z");
    const daysRemaining = computeTrialDaysRemaining(sevenDaysOut, atSeven);
    assert.equal(daysRemaining, 7);
    assert.equal(isTrialSevenDayRemainingEligible(daysRemaining, "trial"), true);

    const entitlement = entitlementFromSubscription(activeTrialSubscription(sevenDaysOut), atSeven);
    const events = getEligibleTrialLifecycleEvents(entitlement, sevenDaysOut, atSeven);
    assert.ok(events.includes("trial_7_days_remaining"));
  });

  it("C — 3-day event eligible correctly", () => {
    const threeDaysOut = "2026-08-04T12:00:00.000Z";
    const atThree = new Date("2026-08-01T12:00:00.000Z");
    const daysRemaining = computeTrialDaysRemaining(threeDaysOut, atThree);
    assert.equal(daysRemaining, 3);
    assert.equal(isTrialThreeDayRemainingEligible(daysRemaining, "trial"), true);
  });

  it("D — 1-day event eligible correctly", () => {
    const oneDayOut = "2026-08-02T12:00:00.000Z";
    const atOne = new Date("2026-08-01T12:00:00.000Z");
    const daysRemaining = computeTrialDaysRemaining(oneDayOut, atOne);
    assert.equal(daysRemaining, 1);
    assert.equal(isTrialOneDayRemainingEligible(daysRemaining, "trial"), true);
  });

  it("E — expiry event eligible when entitlement is trial_expired and recently expired", () => {
    const pastEnd = "2026-07-31T12:00:00.000Z";
    const entitlement = entitlementFromSubscription(expiredTrialSubscription(pastEnd));
    assert.equal(entitlement.state, "trial_expired");
    assert.equal(isTrialExpiredEligible(entitlement.state), true);
    const events = getEligibleTrialLifecycleEvents(entitlement, pastEnd, NOW);
    assert.deepEqual(events, ["trial_expired"]);
  });

  it("F — +3 event eligible only inside exclusive post-expiry band", () => {
    const pastEnd = "2026-07-28T12:00:00.000Z";
    const entitlement = entitlementFromSubscription(expiredTrialSubscription(pastEnd));
    const daysSince = computeDaysSinceTrialEnd(pastEnd, NOW);
    assert.equal(daysSince, 4);
    assert.equal(isTrialExpiredPlusThreeEligible(entitlement.state, daysSince), true);
    assert.equal(isTrialExpiredPlusSevenEligible(entitlement.state, daysSince), false);
    const events = getEligibleTrialLifecycleEvents(entitlement, pastEnd, NOW);
    assert.deepEqual(events, ["trial_expired_plus_3_days"]);
  });

  it("G — +7 event eligible only after seven UTC days since trial end", () => {
    const pastEnd = "2026-07-20T12:00:00.000Z";
    const entitlement = entitlementFromSubscription(expiredTrialSubscription(pastEnd));
    const daysSince = computeDaysSinceTrialEnd(pastEnd, NOW);
    assert.ok(daysSince >= 7);
    assert.equal(isTrialExpiredPlusSevenEligible(entitlement.state, daysSince), true);
    const events = getEligibleTrialLifecycleEvents(entitlement, pastEnd, NOW);
    assert.deepEqual(events, ["trial_expired_plus_7_days"]);
  });

  it("keeps 14-day trial duration constant", () => {
    assert.equal(TRIAL_DURATION_DAYS, 14);
  });
});

describe("trial lifecycle idempotency", () => {
  it("H — successful reservation cannot duplicate send slot", async () => {
    const mock = createLifecycleEventsMock();
    const first = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    const second = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );

    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    if (!second.acquired) {
      assert.equal(second.reason, "in_progress");
    }
    assert.equal(mock.rows.length, 1);
  });

  it("I — failed send remains retryable", async () => {
    const mock = createLifecycleEventsMock();
    const first = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    assert.equal(first.acquired, true);

    await markTrialLifecycleEventFailed(
      "ws-1",
      "trial_started",
      "Resend unavailable",
      1,
      mock.admin as never,
      NOW
    );

    const retry = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    assert.equal(retry.acquired, true);

    await markTrialLifecycleEventSent(
      "ws-1",
      "trial_started",
      { recipientEmail: "owner@example.com", attemptCount: 2 },
      mock.admin as never,
      NOW
    );

    const afterSent = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    assert.equal(afterSent.acquired, false);
    if (!afterSent.acquired) {
      assert.equal(afterSent.reason, "already_sent");
    }
  });

  it("allows takeover when pending reservation is stale", async () => {
    const staleAttemptAt = new Date(
      NOW.getTime() - TRIAL_LIFECYCLE_PENDING_STALE_MS - 1000
    ).toISOString();
    const mock = createLifecycleEventsMock([
      {
        id: "row-1",
        workspace_id: "ws-1",
        event_key: "trial_started",
        sent_at: staleAttemptAt,
        metadata: {
          status: "pending",
          attemptCount: 1,
          lastAttemptAt: staleAttemptAt,
        },
      },
    ]);

    const retry = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    assert.equal(retry.acquired, true);
    assert.equal(mock.rows[0]?.metadata?.status, "pending");
    assert.equal(mock.rows[0]?.metadata?.attemptCount, 2);
  });
});

describe("trial lifecycle delivery", () => {
  it("J — expired workspace email copy mentions read-only and upgrade CTA", () => {
    const rendered = renderTrialExpiredEmail({
      workspaceName: "Acme Collections",
      trialEndsAt: "2026-07-20T12:00:00.000Z",
      workspaceUrl: "https://arrexia.app/ws-1",
      billingUrl: "https://arrexia.app/ws-1/settings?section=billing",
    });

    assert.match(rendered.subject, /trial has ended/i);
    assert.match(rendered.text, /data remains available/i);
    assert.match(rendered.text, /paid plan/i);
    assert.match(rendered.text, /Request an upgrade/i);
    assert.doesNotMatch(rendered.text, /deleted/i);
    assert.doesNotMatch(rendered.text, /disabled/i);
    assert.match(rendered.html, /settings\?section=billing/);
  });

  it("K — paid workspace does not receive trial lifecycle emails", async () => {
    const entitlement = resolveWorkspaceEntitlement({
      storedPlan: "starter",
      subscription: {
        status: "active",
        plan: "starter",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: computeTrialEndsAt(NOW, 30),
      },
      now: NOW,
    });

    const events = getEligibleTrialLifecycleEvents(entitlement, null, NOW);
    assert.deepEqual(events, []);

    const result = await deliverTrialLifecycleEmail(
      "ws-paid",
      "trial_started",
      {
        loadEntitlementFn: async () => entitlement,
        admin: {
          from() {
            throw new Error("should not query subscription for paid workspace");
          },
        } as never,
      },
      NOW
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.sent, false);
      assert.equal(result.reason, "paid_workspace");
    }
  });

  it("L — owner only is recipient", async () => {
    const sent: Array<{ to: string | string[]; subject: string }> = [];
    const mock = createLifecycleEventsMock();
    const entitlement = entitlementFromSubscription(activeTrialSubscription());

    const result = await deliverTrialLifecycleEmail(
      "ws-owner",
      "trial_started",
      {
        admin: {
          from(table: string) {
            if (table === "workspace_subscriptions") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { trial_ends_at: TRIAL_END },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            if (table === "workspaces") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { name: "Owner Co" }, error: null }),
                  }),
                }),
              };
            }
            return mock.admin.from(table);
          },
        } as never,
        loadEntitlementFn: async () => entitlement,
        resolveOwnerFn: async () => ({
          ok: true,
          owner: { userId: "user-owner", email: "owner@example.com", displayName: null },
        }),
        sendEmailFn: async (input) => {
          sent.push({ to: input.to, subject: input.subject });
          return { success: true, messageId: "msg-1" };
        },
      },
      NOW
    );

    assert.equal(result.ok, true);
    if (result.ok && result.sent) {
      assert.equal(result.recipientEmail, "owner@example.com");
    }
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, "owner@example.com");
  });

  it("M — missing owner is retryable and does not permanently dedupe", async () => {
    const mock = createLifecycleEventsMock();
    const entitlement = entitlementFromSubscription(activeTrialSubscription());

    const result = await deliverTrialLifecycleEmail(
      "ws-no-owner",
      "trial_started",
      {
        admin: {
          from(table: string) {
            if (table === "workspace_subscriptions") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { trial_ends_at: TRIAL_END },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return mock.admin.from(table);
          },
        } as never,
        loadEntitlementFn: async () => entitlement,
        resolveOwnerFn: async () => ({ ok: false, reason: "no_owner" }),
        sendEmailFn: async () => {
          throw new Error("send should not be called");
        },
      },
      NOW
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.sent, false);
      assert.equal(result.reason, "no_owner");
    }
    assert.equal(mock.rows[0]?.metadata?.status, "failed");

    const retry = await acquireTrialLifecycleSendSlot(
      "ws-no-owner",
      "trial_started",
      mock.admin as never,
      NOW
    );
    assert.equal(retry.acquired, true);
  });
});

describe("trial lifecycle separation + integration guards", () => {
  it("N — lifecycle sends do not consume reminder entitlements", () => {
    const deliverySrc = readFileSync("lib/billing/trialLifecycleDelivery.ts", "utf8");
    const runSrc = readFileSync("lib/billing/runTrialLifecycleEmails.ts", "utf8");
    assert.doesNotMatch(deliverySrc, /tryConsumeEntitlementUsage/);
    assert.doesNotMatch(deliverySrc, /reserveEntitlementUsage/);
    assert.doesNotMatch(deliverySrc, /rpc_increment_entitlement_usage/);
    assert.doesNotMatch(runSrc, /reminders/);
    assert.doesNotMatch(runSrc, /ruleOccurrenceGuard/);
  });

  it("O — lifecycle cron rejects invalid authentication", () => {
    process.env.CRON_SECRET = "lifecycle-test-secret";
    const unauthorized = verifyCronReminderAuth(
      { get: () => null } as { get(name: string): string | null }
    );
    assert.equal(unauthorized.ok, false);

    const authorized = verifyCronReminderAuth({
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? "Bearer lifecycle-test-secret" : null,
    });
    assert.equal(authorized.ok, true);
  });

  it("P — welcome-email failure cannot break trial creation", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const admin = {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === "workspace_subscriptions") {
                  return { data: null, error: null };
                }
                if (table === "workspaces") {
                  return { data: { trial_consumed_at: null }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            if (table === "workspace_subscriptions") {
              rows.push(payload);
            }
            return Promise.resolve({ error: null });
          },
          update: () => ({
            eq: () => ({
              is: async () => ({ error: null }),
            }),
          }),
        };
      },
    };

    const result = await createArrexiaTrialSubscription(
      "ws-bootstrap",
      admin as never,
      NOW
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.created, true);
    }
    assert.equal(rows.length, 1);
  });

  it("deterministic earliest owner selection", () => {
    const owner = pickEarliestOwnerMember([
      {
        workspace_id: "ws-1",
        user_id: "user-b",
        role: "owner",
        created_at: "2026-02-01T00:00:00.000Z",
      },
      {
        workspace_id: "ws-1",
        user_id: "user-a",
        role: "owner",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(owner?.user_id, "user-a");
  });

  it("renders all lifecycle templates with billing CTA where appropriate", () => {
    const context = {
      workspaceName: "Acme",
      trialEndsAt: TRIAL_END,
      workspaceUrl: "https://arrexia.app/ws-1",
      billingUrl: "https://arrexia.app/ws-1/settings?section=billing",
    };

    for (const eventKey of [
      "trial_started",
      "trial_7_days_remaining",
      "trial_3_days_remaining",
      "trial_1_day_remaining",
      "trial_expired",
      "trial_expired_plus_3_days",
      "trial_expired_plus_7_days",
    ] as const) {
      const rendered = renderTrialLifecycleEmail(eventKey, context);
      assert.ok(rendered.subject.length > 0);
      assert.ok(rendered.html.includes("Acme"));
      assert.ok(rendered.text.length > 0);
    }
  });

  it("lifecycle cron route is separate from reminders cron", () => {
    const vercel = readFileSync("vercel.json", "utf8");
    assert.match(vercel, /\/api\/internal\/billing\/lifecycle\/run/);
    assert.match(vercel, /\/api\/internal\/reminders\/run/);
    assert.doesNotMatch(
      readFileSync("app/api/internal/reminders/run/route.ts", "utf8"),
      /trialLifecycle/
    );
  });
});

describe("pre-commit correctness audit regressions", () => {
  it("1 — concurrent failed reclaim allows only one winner", async () => {
    const mock = createLifecycleEventsMock([
      {
        id: "row-1",
        workspace_id: "ws-1",
        event_key: "trial_started",
        sent_at: NOW.toISOString(),
        metadata: {
          status: "failed",
          attemptCount: 1,
          lastAttemptAt: NOW.toISOString(),
          error: "temporary",
        },
      },
    ]);

    const [first, second] = await Promise.all([
      acquireTrialLifecycleSendSlot("ws-1", "trial_started", mock.admin as never, NOW),
      acquireTrialLifecycleSendSlot("ws-1", "trial_started", mock.admin as never, NOW),
    ]);

    const winners = [first, second].filter(
      (result): result is Extract<typeof result, { acquired: true }> => result.acquired
    );
    assert.equal(winners.length, 1);
  });

  it("2 — stale pending reclaim succeeds once", async () => {
    const staleAttemptAt = new Date(
      NOW.getTime() - TRIAL_LIFECYCLE_PENDING_STALE_MS - 1000
    ).toISOString();
    const mock = createLifecycleEventsMock([
      {
        id: "row-1",
        workspace_id: "ws-1",
        event_key: "trial_started",
        sent_at: staleAttemptAt,
        metadata: {
          status: "pending",
          attemptCount: 1,
          lastAttemptAt: staleAttemptAt,
        },
      },
    ]);

    const first = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );
    const second = await acquireTrialLifecycleSendSlot(
      "ws-1",
      "trial_started",
      mock.admin as never,
      NOW
    );

    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
  });

  it("4 — recent welcome backfill remains eligible", () => {
    const yesterday = new Date("2026-07-31T12:00:00.000Z");
    const trialEndsAt = computeTrialEndsAt(yesterday);
    const entitlement = entitlementFromSubscription(activeTrialSubscription(trialEndsAt), yesterday);
    assert.equal(isTrialStartedEligible(entitlement.state, trialEndsAt, yesterday), true);
  });

  it("5 — stale welcome is not eligible from cron backfill", () => {
    const trialStart = new Date("2026-07-27T12:00:00.000Z");
    const fiveDaysAfterStart = new Date("2026-08-01T12:00:00.000Z");
    const trialEndsAt = computeTrialEndsAt(trialStart);
    const entitlement = entitlementFromSubscription(
      activeTrialSubscription(trialEndsAt),
      fiveDaysAfterStart
    );
    assert.equal(
      isTrialStartedEligible(entitlement.state, trialEndsAt, fiveDaysAfterStart),
      false
    );
    assert.equal(TRIAL_STARTED_BACKFILL_MAX_DAYS, 2);
  });

  it("6 — temporary owner lookup failure remains retryable", async () => {
    const mock = createLifecycleEventsMock();
    const entitlement = entitlementFromSubscription(activeTrialSubscription());
    const result = await deliverTrialLifecycleEmail(
      "ws-lookup",
      "trial_started",
      {
        admin: {
          from(table: string) {
            if (table === "workspace_subscriptions") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { trial_ends_at: TRIAL_END },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return mock.admin.from(table);
          },
        } as never,
        loadEntitlementFn: async () => entitlement,
        resolveOwnerFn: async () => ({ ok: false, reason: "lookup_failed" }),
        sendEmailFn: async () => ({ success: false, error: "should not send" }),
      },
      NOW
    );

    assert.equal(result.ok, true);
    assert.equal(mock.rows[0]?.metadata?.status, "failed");
  });

  it("8 — missed 7-day stage does not replay when already in 3-day band", () => {
    const twoDaysOut = "2026-08-03T12:00:00.000Z";
    const now = new Date("2026-08-01T12:00:00.000Z");
    const entitlement = entitlementFromSubscription(activeTrialSubscription(twoDaysOut), now);
    const events = getEligibleTrialLifecycleEvents(entitlement, twoDaysOut, now);
    assert.deepEqual(events, ["trial_3_days_remaining"]);
    assert.equal(selectTrialLifecycleEventForRun(events), "trial_3_days_remaining");
  });

  it("9 — long-expired workspace selects only one lifecycle event per run", () => {
    const pastEnd = "2026-07-20T12:00:00.000Z";
    const entitlement = entitlementFromSubscription(expiredTrialSubscription(pastEnd));
    const events = getEligibleTrialLifecycleEvents(entitlement, pastEnd, NOW);
    assert.deepEqual(events, ["trial_expired_plus_7_days"]);
    assert.equal(selectTrialLifecycleEventForRun(events), "trial_expired_plus_7_days");
  });

  it("runner selects only one lifecycle event per workspace", () => {
    const pastEnd = "2026-07-20T12:00:00.000Z";
    const entitlement = entitlementFromSubscription(expiredTrialSubscription(pastEnd));
    const events = getEligibleTrialLifecycleEvents(entitlement, pastEnd, NOW);
    assert.equal(selectTrialLifecycleEventForRun(events), "trial_expired_plus_7_days");

    const runSrc = readFileSync("lib/billing/runTrialLifecycleEmails.ts", "utf8");
    assert.match(runSrc, /selectTrialLifecycleEventForRun/);
    assert.doesNotMatch(runSrc, /for \(const eventKey of eligibleEvents\)/);
  });
});

describe("trial lifecycle greeting personalization", () => {
  const templateContext = {
    workspaceName: "Acme",
    trialEndsAt: TRIAL_END,
    workspaceUrl: "https://arrexia.app/ws-1",
    billingUrl: "https://arrexia.app/ws-1/settings?section=billing",
  };

  it("A — owner with valid name renders Hello Mohammed,", () => {
    assert.equal(renderTrialLifecycleGreeting("Mohammed"), "Hello Mohammed,");
    const rendered = renderTrialStartedEmail({
      ...templateContext,
      ownerDisplayName: "Mohammed",
    });
    assert.match(rendered.text, /Hello Mohammed,/);
    assert.match(rendered.html, /Hello Mohammed,/);
  });

  it("B — owner without name renders Hello,", () => {
    assert.equal(renderTrialLifecycleGreeting(null), "Hello,");
    const rendered = renderTrialExpiredEmail({
      ...templateContext,
      ownerDisplayName: null,
    });
    assert.match(rendered.text, /^Hello,/m);
    assert.doesNotMatch(rendered.text, /Hello undefined/);
  });

  it("C — whitespace-only name falls back to Hello,", () => {
    assert.equal(renderTrialLifecycleGreeting("   "), "Hello,");
    assert.equal(renderTrialLifecycleGreeting("\t\n"), "Hello,");
  });

  it("D — email address is never used as greeting name", () => {
    assert.equal(renderTrialLifecycleGreeting("arrexia@atomicmail.io"), "Hello,");
    assert.equal(renderTrialLifecycleGreeting("arrexia@atomicmail.io "), "Hello,");
  });

  it("E — all seven lifecycle templates accept personalization consistently", () => {
    for (const eventKey of [
      "trial_started",
      "trial_7_days_remaining",
      "trial_3_days_remaining",
      "trial_1_day_remaining",
      "trial_expired",
      "trial_expired_plus_3_days",
      "trial_expired_plus_7_days",
    ] as const) {
      const named = renderTrialLifecycleEmail(eventKey, {
        ...templateContext,
        ownerDisplayName: "Mohammed",
      });
      assert.match(named.text, /Hello Mohammed,/);

      const generic = renderTrialLifecycleEmail(eventKey, templateContext);
      assert.match(generic.text, /Hello,/);
      assert.doesNotMatch(generic.text, /Hello Mohammed,/);
    }
  });
});
