import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import "@/lib/billing/__tests__/testSetup";

import { EventName, NodeRuntime, Webhooks, type EventEntity } from "@paddle/paddle-node-sdk";

import { buildPaddleAtomicRpcParams } from "@/lib/billing/paddle/webhook/applyPaddleSubscriptionFulfillment";
import { mapPaddleSubscriptionToArrexiaState } from "@/lib/billing/paddle/webhook/mapPaddleSubscriptionStatus";
import {
  beginPaddleWebhookProcessing,
  finalizePaddleWebhookProcessing,
} from "@/lib/billing/paddle/webhook/paddleWebhookIdempotency";
import {
  handlePaddleWebhookRequest,
  handleVerifiedPaddleWebhookEvent,
} from "@/lib/billing/paddle/webhook/handlePaddleWebhook";
import {
  extractBillingPeriod,
  extractPrimaryPaddlePriceId,
  parsePaddleCheckoutCustomData,
} from "@/lib/billing/paddle/webhook/parsePaddleWebhookPayload";
import { evaluatePaddleLifecycleEventOrdering } from "@/lib/billing/paddle/webhook/paddleLifecycleOrdering";
import { processPaddleWebhookEvent } from "@/lib/billing/paddle/webhook/processPaddleWebhookEvent";
import { resolvePlanFromPaddlePriceId } from "@/lib/billing/paddle/priceCatalog";
import { verifyPaddleWebhookSignatureManually } from "@/lib/billing/paddle/webhook/diagnosePaddleWebhookSignature";
import {
  getPaddleWebhooksVerifier,
  resetPaddleWebhooksVerifierForTests,
} from "@/lib/billing/paddle/webhook/paddleWebhooksVerifier";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const STARTER_MONTHLY_PRICE = "pri_01m160et1jrsbnb0hftets4ej2";
const PRO_MONTHLY_PRICE = "pri_01m160evbf5cecq92r62bwkt95";
const PADDLE_SUBSCRIPTION_ID = "sub_test_paddle_001";
const PADDLE_CUSTOMER_ID = "ctm_test_paddle_001";

function buildSubscriptionEvent(
  eventType: string,
  overrides: Record<string, unknown> = {},
  eventMeta: { occurredAt?: string; eventId?: string } = {}
): EventEntity {
  return {
    eventId:
      eventMeta.eventId ??
      `evt_${eventType.replace(/\./g, "_")}_${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    occurredAt: eventMeta.occurredAt ?? "2026-08-29T12:00:00.000Z",
    notificationId: "ntf_test",
    data: {
      id: PADDLE_SUBSCRIPTION_ID,
      status: "active",
      customer_id: PADDLE_CUSTOMER_ID,
      custom_data: {
        workspace_id: WORKSPACE_ID,
        plan: "starter",
        billing_interval: "monthly",
      },
      items: [{ price: { id: STARTER_MONTHLY_PRICE } }],
      current_billing_period: {
        starts_at: "2026-08-29T00:00:00Z",
        ends_at: "2026-09-29T00:00:00Z",
      },
      ...overrides,
    },
  } as unknown as EventEntity;
}

function buildTransactionCompletedEvent(
  overrides: Record<string, unknown> = {},
  eventMeta: { occurredAt?: string; eventId?: string } = {}
): EventEntity {
  return {
    eventId:
      eventMeta.eventId ??
      `evt_transaction_${Math.random().toString(36).slice(2, 8)}`,
    eventType: EventName.TransactionCompleted,
    occurredAt: eventMeta.occurredAt ?? "2026-08-29T12:00:00.000Z",
    notificationId: "ntf_test",
    data: {
      status: "completed",
      customer_id: PADDLE_CUSTOMER_ID,
      subscription_id: PADDLE_SUBSCRIPTION_ID,
      custom_data: {
        workspace_id: WORKSPACE_ID,
        plan: "starter",
        billing_interval: "monthly",
      },
      items: [{ price: { id: STARTER_MONTHLY_PRICE } }],
      billing_period: {
        starts_at: "2026-08-29T00:00:00Z",
        ends_at: "2026-09-29T00:00:00Z",
      },
      ...overrides,
    },
  } as unknown as EventEntity;
}

function installPaddleBillingMock() {
  const state = createBillingMockState();
  seedWorkspace(state, WORKSPACE_ID);
  seedPlan(state, WORKSPACE_ID, "free");
  seedSubscription(state, WORKSPACE_ID, {
    plan: "free",
    status: "trial",
    billing_interval: "monthly",
    trial_starts_at: "2026-08-01T00:00:00Z",
    trial_ends_at: "2026-08-15T00:00:00Z",
    trial_consumed_at: "2026-08-01T00:00:00Z",
    current_period_starts_at: null,
    current_period_ends_at: null,
  });
  const admin = createBillingMockAdmin(state);
  setSupabaseAdminClientForTests(admin);
  return state;
}

function seedActivePaddleSubscription(
  state: ReturnType<typeof createBillingMockState>,
  options: {
    status?: string;
    providerLastEventAt?: string | null;
  } = {}
) {
  seedWorkspace(state, WORKSPACE_ID);
  seedPlan(state, WORKSPACE_ID, "starter");
  const existingIndex = state.subscriptions.findIndex(
    (row) => row.workspace_id === WORKSPACE_ID
  );
  const row = {
    plan: "starter",
    status: options.status ?? "active",
    billing_interval: "monthly",
    payment_provider: "paddle",
    provider_subscription_id: PADDLE_SUBSCRIPTION_ID,
    provider_customer_id: PADDLE_CUSTOMER_ID,
    provider_last_event_at: options.providerLastEventAt ?? null,
    trial_starts_at: "2026-08-01T00:00:00Z",
    trial_ends_at: "2026-08-15T00:00:00Z",
    trial_consumed_at: "2026-08-01T00:00:00Z",
    current_period_starts_at: "2026-08-29T00:00:00Z",
    current_period_ends_at: "2026-09-29T00:00:00Z",
  };
  if (existingIndex >= 0) {
    state.subscriptions[existingIndex] = { workspace_id: WORKSPACE_ID, ...row };
  } else {
    seedSubscription(state, WORKSPACE_ID, row);
  }
}

afterEach(() => {
  setSupabaseAdminClientForTests(null);
  resetPaddleWebhooksVerifierForTests();
  process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
});

function buildSignedPaddleWebhookFixture() {
  const secret = "pdl_ntfset_test_secret_for_sdk_runtime";
  const rawBody = JSON.stringify({
    event_id: "evt_sdk_runtime_test",
    event_type: "transaction.completed",
    occurred_at: "2026-08-29T12:00:00.000Z",
    data: { id: "txn_test" },
  });
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${rawBody}`, "utf8").digest("hex");
  const signature = `ts=${ts};h1=${h1}`;

  return { secret, rawBody, signature, ts };
}

describe("Paddle SDK webhook runtime initialization", () => {
  it("fails SDK verification without NodeRuntime.initialize() even when manual HMAC matches", async () => {
    const fixture = buildSignedPaddleWebhookFixture();
    const manual = verifyPaddleWebhookSignatureManually({
      rawBody: fixture.rawBody,
      signature: fixture.signature,
      secret: fixture.secret,
      nowMs: fixture.ts * 1000,
    });

    assert.equal(manual.manualSignatureMatch, true);

    const bareWebhooks = new Webhooks();
    assert.equal(
      await bareWebhooks.isSignatureValid(fixture.rawBody, fixture.secret, fixture.signature),
      false
    );

    NodeRuntime.initialize();
    assert.equal(
      await bareWebhooks.isSignatureValid(fixture.rawBody, fixture.secret, fixture.signature),
      true
    );
  });

  it("accepts valid signatures through getPaddleWebhooksVerifier()", async () => {
    const fixture = buildSignedPaddleWebhookFixture();
    const verifier = getPaddleWebhooksVerifier();

    assert.equal(
      await verifier.isSignatureValid(fixture.rawBody, fixture.secret, fixture.signature),
      true
    );
  });
});

describe("Paddle price catalog reverse lookup", () => {
  it("maps known sandbox price IDs to canonical plan and interval", () => {
    const starterMonthly = resolvePlanFromPaddlePriceId(
      "pri_01m160et1jrsbnb0hftets4ej2",
      "sandbox"
    );
    assert.equal(starterMonthly.ok, true);
    if (starterMonthly.ok) {
      assert.equal(starterMonthly.plan, "starter");
      assert.equal(starterMonthly.interval, "monthly");
    }

    const proAnnual = resolvePlanFromPaddlePriceId(
      "pri_01m160evjx58qzrjge92aq8mrc",
      "sandbox"
    );
    assert.equal(proAnnual.ok, true);
    if (proAnnual.ok) {
      assert.equal(proAnnual.plan, "pro");
      assert.equal(proAnnual.interval, "annual");
    }
  });

  it("rejects unknown price IDs instead of provisioning", () => {
    const unknown = resolvePlanFromPaddlePriceId("pri_unknown_price", "sandbox");
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.code, "UNKNOWN_PRICE_ID");
    }
  });
});

describe("Paddle webhook payload parsing", () => {
  it("parses checkout customData workspace hints", () => {
    const parsed = parsePaddleCheckoutCustomData({
      workspace_id: WORKSPACE_ID,
      plan: "pro",
      billing_interval: "annual",
    });
    assert.equal(parsed.workspaceId, WORKSPACE_ID);
    assert.equal(parsed.plan, "pro");
    assert.equal(parsed.billingInterval, "annual");
  });

  it("extracts primary recurring price ID from subscription items", () => {
    const priceId = extractPrimaryPaddlePriceId([
      {
        price: { id: "pri_01m160evbf5cecq92r62bwkt95" },
      },
    ]);
    assert.equal(priceId, "pri_01m160evbf5cecq92r62bwkt95");
  });

  it("extracts billing period boundaries", () => {
    const period = extractBillingPeriod({
      currentBillingPeriod: {
        startsAt: "2026-08-29T00:00:00Z",
        endsAt: "2026-09-29T00:00:00Z",
      },
    });
    assert.equal(period.startsAt, "2026-08-29T00:00:00Z");
    assert.equal(period.endsAt, "2026-09-29T00:00:00Z");
  });
});

describe("Paddle subscription status mapping", () => {
  it("maps active Paddle subscriptions to Arrexia active with cancel-at-period-end flag", () => {
    const mapped = mapPaddleSubscriptionToArrexiaState({
      paddleStatus: "active",
      scheduledChangeAction: "cancel",
    });
    assert.equal(mapped.status, "active");
    assert.equal(mapped.cancelAtPeriodEnd, true);
  });

  it("maps Paddle past_due without destructive cancellation", () => {
    const mapped = mapPaddleSubscriptionToArrexiaState({
      paddleStatus: "past_due",
    });
    assert.equal(mapped.status, "past_due");
    assert.equal(mapped.cancelAtPeriodEnd, false);
  });

  it("maps Paddle canceled to Arrexia cancelled without deleting data", () => {
    const mapped = mapPaddleSubscriptionToArrexiaState({
      paddleStatus: "canceled",
    });
    assert.equal(mapped.status, "cancelled");
  });

  it("maps Paddle paused to non-destructive past_due semantics", () => {
    const mapped = mapPaddleSubscriptionToArrexiaState({
      paddleStatus: "paused",
    });
    assert.equal(mapped.status, "past_due");
  });
});

describe("Paddle atomic fulfillment RPC params", () => {
  it("builds paddle payment_provider and preserves trial timestamps", () => {
    const params = buildPaddleAtomicRpcParams({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      billingInterval: "monthly",
      status: "active",
      periodStartsAt: "2026-08-29T00:00:00Z",
      periodEndsAt: "2026-09-29T00:00:00Z",
      cancelAtPeriodEnd: false,
      existingSubscription: {
        status: "trial",
        plan: "free",
        trialStartsAt: "2026-08-01T00:00:00Z",
        trialEndsAt: "2026-08-15T00:00:00Z",
        trialConsumedAt: "2026-08-01T00:00:00Z",
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
      },
    });

    assert.ok(params);
    assert.equal(params?.p_payment_provider, "paddle");
    assert.equal(params?.p_subscription_status, "active");
    assert.equal(params?.p_target_plan, "starter");
    assert.equal(params?.p_trial_starts_at, "2026-08-01T00:00:00Z");
  });
});

describe("Paddle webhook idempotency ledger", () => {
  it("treats repeated event IDs as duplicates without reprocessing", async () => {
    const events = new Map<string, Record<string, unknown>>();

    const admin = {
      from(table: string) {
        assert.equal(table, "paddle_webhook_events");
        return {
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  async maybeSingle() {
                    if (events.has(String(row.event_id))) {
                      return {
                        data: null,
                        error: { code: "23505", message: "duplicate" },
                      };
                    }
                    events.set(String(row.event_id), { ...row, status: "processing" });
                    return { data: { event_id: row.event_id }, error: null };
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(_column: string, eventId: string) {
                return {
                  async maybeSingle() {
                    const existing = events.get(eventId);
                    return {
                      data: existing
                        ? { status: existing.status, result: existing.result ?? null }
                        : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_column: string, eventId: string) {
                return Promise.resolve({
                  error: (() => {
                    const existing = events.get(eventId);
                    if (existing) {
                      Object.assign(existing, patch);
                    }
                    return null;
                  })(),
                });
              },
            };
          },
        };
      },
    };

    const first = await beginPaddleWebhookProcessing(
      {
        eventId: "evt_test_1",
        eventType: EventName.TransactionCompleted,
        occurredAt: "2026-08-29T00:00:00Z",
      },
      admin as never
    );
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.state, "new");
    }

    await finalizePaddleWebhookProcessing(
      {
        eventId: "evt_test_1",
        eventType: EventName.TransactionCompleted,
        occurredAt: "2026-08-29T00:00:00Z",
        status: "processed",
        result: "transaction_completed_synced",
      },
      admin as never
    );

    const second = await beginPaddleWebhookProcessing(
      {
        eventId: "evt_test_1",
        eventType: EventName.TransactionCompleted,
        occurredAt: "2026-08-29T00:00:00Z",
      },
      admin as never
    );
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.state, "duplicate");
      assert.equal(second.status, "processed");
    }
  });
});

describe("Paddle webhook migration contract", () => {
  const webhookMigration = readFileSync(
    "supabase/migrations/20260829180000_paddle_webhook_events.sql",
    "utf8"
  );
  const lifecycleMigration = readFileSync(
    "supabase/migrations/20260830120000_paddle_provider_last_event_at.sql",
    "utf8"
  );

  it("creates idempotency ledger with event_id primary key", () => {
    assert.match(webhookMigration, /paddle_webhook_events/);
    assert.match(webhookMigration, /event_id text PRIMARY KEY/);
    assert.match(webhookMigration, /status text NOT NULL CHECK \(status IN \('processing', 'processed', 'ignored', 'failed'\)\)/);
    assert.match(webhookMigration, /ENABLE ROW LEVEL SECURITY/);
  });

  it("adds provider_last_event_at for lifecycle ordering", () => {
    assert.match(lifecycleMigration, /provider_last_event_at timestamptz/);
    assert.match(lifecycleMigration, /workspace_subscriptions/);
  });
});

describe("Paddle checkout safety boundaries", () => {
  it("does not mutate entitlements from checkout client modules", () => {
    const files = [
      "lib/billing/paddle/openPaddleCheckout.ts",
      "components/billing/PaddleCheckoutButton.tsx",
    ];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /applyPaddleSubscriptionFulfillment/);
      assert.doesNotMatch(src, /processPaddleWebhookEvent/);
      assert.doesNotMatch(src, /changeWorkspacePlan/);
    }
  });

  it("registers webhook route without client-side imports", () => {
    const route = readFileSync("app/api/webhooks/paddle/route.ts", "utf8");
    assert.match(route, /handlePaddleWebhookRequest/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_PADDLE_CLIENT_TOKEN/);
  });
});

describe("Paddle webhook handled event coverage", () => {
  it("includes required subscription lifecycle events", async () => {
    const required = [
      EventName.SubscriptionCreated,
      EventName.SubscriptionUpdated,
      EventName.SubscriptionActivated,
      EventName.SubscriptionCanceled,
      EventName.SubscriptionPastDue,
      EventName.SubscriptionPaused,
      EventName.SubscriptionResumed,
      EventName.TransactionCompleted,
    ];

    const { HANDLED_SUBSCRIPTION_EVENTS } = await import(
      "@/lib/billing/paddle/webhook/processPaddleWebhookEvent"
    );

    for (const eventName of required) {
      if (eventName === EventName.TransactionCompleted) {
        continue;
      }
      assert.equal(HANDLED_SUBSCRIPTION_EVENTS.has(eventName), true, eventName);
    }
  });
});

describe("Paddle webhook signature handling", () => {
  it("rejects invalid webhook signatures", async () => {
    process.env.PADDLE_WEBHOOK_SECRET = "test_webhook_secret";
    delete process.env.PADDLE_API_KEY;

    const result = await handlePaddleWebhookRequest(
      {
        rawBody: '{"event_id":"evt_invalid"}',
        signature: "bad-signature",
      },
      {
        unmarshal: async () => {
          throw new Error("invalid signature");
        },
      }
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it("does not require PADDLE_API_KEY for signature verification", async () => {
    process.env.PADDLE_WEBHOOK_SECRET = "test_webhook_secret";
    delete process.env.PADDLE_API_KEY;

    const verifiedEvent = buildTransactionCompletedEvent();
    const result = await handlePaddleWebhookRequest(
      {
        rawBody: JSON.stringify({ event_id: verifiedEvent.eventId }),
        signature: "ts=1;h1=abc",
      },
      {
        unmarshal: async () => verifiedEvent,
        handleVerifiedEvent: async () => ({
          ok: true,
          status: 200 as const,
          duplicate: false,
          result: "verified_without_api_key",
        }),
      }
    );

    assert.equal(result.ok, true);
  });

  it("accepts valid signatures and processes verified events", async () => {
    process.env.PADDLE_WEBHOOK_SECRET = "test_webhook_secret";

    const verifiedEvent = buildTransactionCompletedEvent();
    const result = await handlePaddleWebhookRequest(
      {
        rawBody: JSON.stringify({ event_id: verifiedEvent.eventId }),
        signature: "valid-signature",
      },
      {
        unmarshal: async () => verifiedEvent,
        handleVerifiedEvent: async () => ({
          ok: true,
          status: 200 as const,
          duplicate: false,
          result: "transaction_completed_synced",
        }),
      }
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 200);
      assert.equal(result.duplicate, false);
      assert.equal(result.result, "transaction_completed_synced");
    }
  });
});

describe("Paddle webhook workspace provisioning", () => {
  it("activates the correct workspace for a verified transaction", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();

    const result = await processPaddleWebhookEvent(buildTransactionCompletedEvent());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "fulfilled");
      assert.equal(result.workspaceId, WORKSPACE_ID);
    }

    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.ok(subscription);
    assert.equal(subscription?.plan, "starter");
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.payment_provider, "paddle");
    assert.equal(subscription?.provider_subscription_id, PADDLE_SUBSCRIPTION_ID);
  });

  it("does not provision when workspace is missing", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await processPaddleWebhookEvent(
      buildTransactionCompletedEvent({
        custom_data: { workspace_id: WORKSPACE_ID },
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "ignored");
      assert.equal(result.reason, "transaction_workspace_unresolved");
    }
    assert.equal(state.subscriptions.length, 0);
  });

  it("does not provision unknown price IDs even with workspace hints", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();

    const result = await processPaddleWebhookEvent(
      buildTransactionCompletedEvent({
        items: [{ price: { id: "pri_unknown_price" } }],
        custom_data: {
          workspace_id: WORKSPACE_ID,
          plan: "business",
          billing_interval: "annual",
        },
      })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "ignored");
      assert.equal(result.reason, "unknown_paddle_price");
    }

    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.plan, "free");
    assert.equal(subscription?.status, "trial");
  });
});

describe("Paddle webhook event ordering", () => {
  it("tolerates transaction.completed before subscription.created", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();

    const transactionResult = await processPaddleWebhookEvent(
      buildTransactionCompletedEvent()
    );
    const subscriptionResult = await processPaddleWebhookEvent(
      buildSubscriptionEvent(EventName.SubscriptionCreated)
    );

    assert.equal(transactionResult.ok, true);
    assert.equal(subscriptionResult.ok, true);

    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.plan, "starter");
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.provider_subscription_id, PADDLE_SUBSCRIPTION_ID);
  });

  it("tolerates subscription.created before transaction.completed", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();

    const subscriptionResult = await processPaddleWebhookEvent(
      buildSubscriptionEvent(EventName.SubscriptionCreated)
    );
    const transactionResult = await processPaddleWebhookEvent(
      buildTransactionCompletedEvent()
    );

    assert.equal(subscriptionResult.ok, true);
    assert.equal(transactionResult.ok, true);

    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.plan, "starter");
    assert.equal(subscription?.status, "active");
  });
});

describe("Paddle webhook lifecycle synchronization", () => {
  it("syncs subscription.updated without deleting workspace data", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();
    await processPaddleWebhookEvent(buildTransactionCompletedEvent());

    const updated = await processPaddleWebhookEvent(
      buildSubscriptionEvent(EventName.SubscriptionUpdated, {
        status: "past_due",
        items: [{ price: { id: PRO_MONTHLY_PRICE } }],
      })
    );

    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.action, "fulfilled");
    }

    assert.equal(state.workspaces.some((row) => row.id === WORKSPACE_ID), true);
    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.plan, "pro");
    assert.equal(subscription?.status, "past_due");
  });

  it("maps cancellation to cancelled without removing workspace rows", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();
    await processPaddleWebhookEvent(buildTransactionCompletedEvent());

    const canceled = await processPaddleWebhookEvent(
      buildSubscriptionEvent(EventName.SubscriptionCanceled, {
        status: "canceled",
      })
    );

    assert.equal(canceled.ok, true);
    assert.equal(state.workspaces.length, 1);
    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.status, "cancelled");
    assert.equal(subscription?.plan, "starter");
  });

  it("resolves subsequent events by provider_subscription_id", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installPaddleBillingMock();
    await processPaddleWebhookEvent(buildTransactionCompletedEvent());

    const followUp = await processPaddleWebhookEvent(
      buildSubscriptionEvent(EventName.SubscriptionUpdated, {
        custom_data: undefined,
        status: "active",
        scheduled_change: { action: "cancel" },
      })
    );

    assert.equal(followUp.ok, true);
    if (followUp.ok) {
      assert.equal(followUp.workspaceId, WORKSPACE_ID);
    }

    const subscription = state.subscriptions.find(
      (row) => row.workspace_id === WORKSPACE_ID
    );
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.cancel_at_period_end, true);
  });
});

describe("Paddle webhook verified handler idempotency", () => {
  it("returns HTTP 200 for duplicate verified events", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    installPaddleBillingMock();

    const event = buildTransactionCompletedEvent();
    event.eventId = "evt_duplicate_test";

    const first = await handleVerifiedPaddleWebhookEvent(event);
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.duplicate, false);
    }

    const second = await handleVerifiedPaddleWebhookEvent({
      ...event,
      eventId: "evt_duplicate_test",
    });
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.duplicate, true);
      assert.equal(second.status, 200);
    }
  });
});

describe("Paddle lifecycle occurred_at ordering", () => {
  it("ignores older past_due after newer active was applied", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    seedActivePaddleSubscription(state, {
      status: "active",
      providerLastEventAt: "2026-08-30T12:00:00.000Z",
    });
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await processPaddleWebhookEvent(
      buildSubscriptionEvent(
        EventName.SubscriptionPastDue,
        { status: "past_due" },
        { occurredAt: "2026-08-29T12:00:00.000Z" }
      )
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "ignored");
      assert.equal(result.reason, "stale_event_ignored");
    }

    const subscription = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.provider_last_event_at, "2026-08-30T12:00:00.000Z");
  });

  it("ignores older activated after newer canceled was applied", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    seedActivePaddleSubscription(state, {
      status: "cancelled",
      providerLastEventAt: "2026-08-30T12:00:00.000Z",
    });
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await processPaddleWebhookEvent(
      buildSubscriptionEvent(
        EventName.SubscriptionActivated,
        { status: "active" },
        { occurredAt: "2026-08-29T12:00:00.000Z" }
      )
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reason, "stale_event_ignored");
    }

    const subscription = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    assert.equal(subscription?.status, "cancelled");
  });

  it("returns HTTP 200 and records ignored for stale lifecycle webhook events", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    seedActivePaddleSubscription(state, {
      status: "active",
      providerLastEventAt: "2026-08-30T12:00:00.000Z",
    });
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const event = buildSubscriptionEvent(
      EventName.SubscriptionPastDue,
      { status: "past_due" },
      { occurredAt: "2026-08-29T12:00:00.000Z", eventId: "evt_stale_lifecycle_test" }
    );

    const result = await handleVerifiedPaddleWebhookEvent(event);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 200);
      assert.equal(result.duplicate, false);
      assert.equal(result.result, "stale_event_ignored");
    }

    const ledger = state.paddleWebhookEvents.find(
      (row) => row.event_id === "evt_stale_lifecycle_test"
    );
    assert.equal(ledger?.status, "ignored");
    assert.equal(ledger?.result, "stale_event_ignored");
  });

  it("applies newer lifecycle events and advances provider_last_event_at", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    seedActivePaddleSubscription(state, {
      status: "active",
      providerLastEventAt: "2026-08-29T12:00:00.000Z",
    });
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await processPaddleWebhookEvent(
      buildSubscriptionEvent(
        EventName.SubscriptionCanceled,
        { status: "canceled" },
        { occurredAt: "2026-08-30T12:00:00.000Z" }
      )
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "fulfilled");
    }

    const subscription = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    assert.equal(subscription?.status, "cancelled");
    assert.equal(subscription?.provider_last_event_at, "2026-08-30T12:00:00.000Z");
  });

  it("ignores equal-timestamp lifecycle downgrades deterministically", () => {
    const decision = evaluatePaddleLifecycleEventOrdering({
      incomingOccurredAt: "2026-08-30T12:00:00.000Z",
      storedProviderLastEventAt: "2026-08-30T12:00:00.000Z",
      currentStatus: "active",
      incomingStatus: "past_due",
    });

    assert.equal(decision.action, "ignore");
    if (decision.action === "ignore") {
      assert.equal(decision.reason, "stale_event_ignored");
    }
  });

  it("does not apply lifecycle ordering to transaction.completed", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = createBillingMockState();
    seedActivePaddleSubscription(state, {
      status: "active",
      providerLastEventAt: "2026-08-30T12:00:00.000Z",
    });
    setSupabaseAdminClientForTests(createBillingMockAdmin(state));

    const result = await processPaddleWebhookEvent(
      buildTransactionCompletedEvent({}, { occurredAt: "2026-08-29T12:00:00.000Z" })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "fulfilled");
      assert.equal(result.reason, "transaction_completed_synced");
    }
  });
});
