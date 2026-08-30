import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import { EventName, type EventEntity } from "@paddle/paddle-node-sdk";

import { deliverPaidSubscriptionActivatedEmail } from "@/lib/billing/paidLifecycleDelivery";
import {
  acquirePaidLifecycleSendSlot,
  type PaidLifecycleEventKey,
  type PaidLifecycleEventMetadata,
} from "@/lib/billing/paidLifecycleEvents";
import { PADDLE_SANDBOX_PRICE_CATALOG } from "@/lib/billing/paddle/priceCatalog";
import { processPaddleWebhookEvent } from "@/lib/billing/paddle/webhook/processPaddleWebhookEvent";
import { deliverTrialLifecycleEmail } from "@/lib/billing/trialLifecycleDelivery";
import { getEligibleTrialLifecycleEvents } from "@/lib/billing/trialLifecycleEligibility";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import { resolvePlanFromPaddlePriceId } from "@/lib/billing/paddle/priceCatalog";
import {
  formatBillingIntervalLabel,
  formatPaidSubscriptionActivationPrice,
  getBillingUiPlanLimits,
} from "@/lib/billing/plans";
import { renderPaidSubscriptionActivatedEmail } from "@/lib/email/templates";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const PADDLE_SUBSCRIPTION_ID = "sub_paid_activation_test";
const OWNER_EMAIL = "owner@example.com";
const PERIOD_END = "2026-09-29T00:00:00Z";

type PaidLifecycleEventRow = {
  id: string;
  workspace_id: string;
  provider_subscription_id: string;
  event_key: PaidLifecycleEventKey;
  sent_at: string;
  metadata: PaidLifecycleEventMetadata | null;
};

function createPaidLifecycleEventsMock(initial: PaidLifecycleEventRow[] = []) {
  const rows = [...initial];
  let idCounter = 1;

  function findRow(providerSubscriptionId: string, eventKey: PaidLifecycleEventKey) {
    return (
      rows.find(
        (row) =>
          row.provider_subscription_id === providerSubscriptionId && row.event_key === eventKey
      ) ?? null
    );
  }

  const admin = {
    from(table: string) {
      if (table !== "workspace_paid_lifecycle_events") {
        throw new Error(`Unexpected table ${table}`);
      }

      let providerFilter: string | null = null;
      let eventFilter: PaidLifecycleEventKey | null = null;
      let idFilter: string | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      const filters: Array<{ path: string; op: string; value: string | null }> = [];
      let metadataIsNull = false;

      function rowMatchesReclaimFilters(row: PaidLifecycleEventRow): boolean {
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
            : providerFilter && eventFilter
              ? findRow(providerFilter, eventFilter)
              : null;
        if (!row || !rowMatchesReclaimFilters(row)) {
          return { data: null, error: null };
        }
        if (updatePayload?.metadata) {
          row.metadata = updatePayload.metadata as PaidLifecycleEventMetadata;
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
          if (column === "provider_subscription_id") providerFilter = value;
          if (column === "event_key") eventFilter = value as PaidLifecycleEventKey;
          if (column === "id") idFilter = value;
          return builder;
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          if (updatePayload && providerFilter && eventFilter) {
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
          filters.length = 0;
          metadataIsNull = false;
          return builder;
        },
        upsert(payload: Record<string, unknown>) {
          const providerSubscriptionId = String(payload.provider_subscription_id);
          const eventKey = payload.event_key as PaidLifecycleEventKey;
          const existing = findRow(providerSubscriptionId, eventKey);
          if (existing) {
            existing.metadata = (payload.metadata as PaidLifecycleEventMetadata | null) ?? null;
            existing.sent_at = String(payload.sent_at ?? existing.sent_at);
            return Promise.resolve({ error: null });
          }
          rows.push({
            id: `row-${idCounter++}`,
            workspace_id: String(payload.workspace_id),
            provider_subscription_id: providerSubscriptionId,
            event_key: eventKey,
            sent_at: String(payload.sent_at ?? new Date().toISOString()),
            metadata: (payload.metadata as PaidLifecycleEventMetadata | null) ?? null,
          });
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          if (insertPayload) {
            const providerSubscriptionId = String(insertPayload.provider_subscription_id);
            const eventKey = insertPayload.event_key as PaidLifecycleEventKey;
            if (findRow(providerSubscriptionId, eventKey)) {
              return Promise.resolve({
                data: null,
                error: { code: "23505", message: "duplicate" },
              });
            }
            const row: PaidLifecycleEventRow = {
              id: `row-${idCounter++}`,
              workspace_id: String(insertPayload.workspace_id),
              provider_subscription_id: providerSubscriptionId,
              event_key: eventKey,
              sent_at: new Date().toISOString(),
              metadata: (insertPayload.metadata as PaidLifecycleEventMetadata | null) ?? null,
            };
            rows.push(row);
            insertPayload = null;
            return Promise.resolve({ data: { id: row.id }, error: null });
          }

          if (updatePayload) {
            const result = applyUpdate();
            updatePayload = null;
            return Promise.resolve(result);
          }

          if (providerFilter && eventFilter) {
            const row = findRow(providerFilter, eventFilter);
            return Promise.resolve({ data: row, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        },
      };

      return builder;
    },
  };

  return { admin, rows };
}

function buildWorkspaceAdmin(paidMock: ReturnType<typeof createPaidLifecycleEventsMock>) {
  return {
    from(table: string) {
      if (table === "workspaces") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Acme Collections" }, error: null }),
            }),
          }),
        };
      }
      if (table === "workspace_paid_lifecycle_events") {
        return paidMock.admin.from(table);
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function buildTransactionEvent(
  priceId: string,
  billingInterval: "monthly" | "annual",
  periodEnd: string = PERIOD_END
): EventEntity {
  return {
    eventId: `evt_tx_${priceId.slice(-6)}`,
    eventType: EventName.TransactionCompleted,
    occurredAt: "2026-08-29T12:00:00.000Z",
    notificationId: "ntf_test",
    data: {
      status: "completed",
      customer_id: "ctm_test",
      subscription_id: PADDLE_SUBSCRIPTION_ID,
      custom_data: {
        workspace_id: WORKSPACE_ID,
        billing_interval: billingInterval,
      },
      items: [{ price: { id: priceId } }],
      billing_period: {
        starts_at: "2026-08-29T00:00:00Z",
        ends_at: periodEnd,
      },
    },
  } as unknown as EventEntity;
}

function buildSubscriptionUpdatedEvent(priceId: string): EventEntity {
  return {
    eventId: "evt_sub_updated_test",
    eventType: EventName.SubscriptionUpdated,
    occurredAt: "2026-08-30T12:00:00.000Z",
    notificationId: "ntf_test",
    data: {
      id: PADDLE_SUBSCRIPTION_ID,
      status: "active",
      customer_id: "ctm_test",
      custom_data: { workspace_id: WORKSPACE_ID },
      items: [{ price: { id: priceId } }],
      current_billing_period: {
        starts_at: "2026-08-29T00:00:00Z",
        ends_at: PERIOD_END,
      },
    },
  } as unknown as EventEntity;
}

function installBillingMockForWebhook() {
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
  setSupabaseAdminClientForTests(createBillingMockAdmin(state));
  return state;
}

function renderForPlan(
  plan: "starter" | "pro" | "business",
  interval: "monthly" | "annual",
  periodEnd: string = PERIOD_END
) {
  const resolution = resolvePlanFromPaddlePriceId(
    PADDLE_SANDBOX_PRICE_CATALOG[plan][interval],
    "sandbox"
  );
  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    throw new Error("catalog resolution failed");
  }

  const planNames = { starter: "Starter", pro: "Pro", business: "Business" } as const;

  return renderPaidSubscriptionActivatedEmail({
    workspaceName: "Acme Collections",
    workspaceUrl: `https://arrexia.app/${WORKSPACE_ID}`,
    ownerDisplayName: "Alex",
    planName: planNames[plan],
    billingIntervalLabel: formatBillingIntervalLabel(interval),
    priceLabel: formatPaidSubscriptionActivationPrice(plan, interval),
    renewalDate: periodEnd,
    planLimits: getBillingUiPlanLimits(plan),
  });
}

describe("paid subscription activation email template", () => {
  it("A — Starter monthly: plan, Monthly, $39/month, renewal date", () => {
    const rendered = renderForPlan("starter", "monthly");
    assert.equal(rendered.subject, "Your Arrexia Starter subscription is active");
    assert.match(rendered.text, /Plan:\s*Starter/i);
    assert.match(rendered.text, /Billing:\s*Monthly/i);
    assert.match(rendered.text, /Price:\s*\$39\/month/i);
    assert.match(rendered.text, /Next renewal:\s*Sep 29, 2026/i);
    assert.match(rendered.text, /Your workspace is ready/i);
    assert.doesNotMatch(rendered.text, /receipt/i);
    assert.doesNotMatch(rendered.text, /tax invoice/i);
    assert.doesNotMatch(rendered.text, /payment receipt/i);
  });

  it("B — Starter annual: Annual, $390/year, renewal date", () => {
    const rendered = renderForPlan("starter", "annual", "2027-08-29T00:00:00Z");
    assert.match(rendered.text, /Billing:\s*Annual/i);
    assert.match(rendered.text, /Price:\s*\$390\/year/i);
    assert.match(rendered.text, /Next renewal:\s*Aug 29, 2027/i);
  });

  it("C — Pro monthly and annual formatting", () => {
    const monthly = renderForPlan("pro", "monthly");
    assert.match(monthly.text, /Plan:\s*Pro/i);
    assert.match(monthly.text, /Billing:\s*Monthly/i);
    assert.match(monthly.text, /Price:\s*\$89\/month/i);

    const annual = renderForPlan("pro", "annual", "2027-08-29T00:00:00Z");
    assert.match(annual.text, /Billing:\s*Annual/i);
    assert.match(annual.text, /Price:\s*\$890\/year/i);
  });

  it("D — Business monthly and annual formatting", () => {
    const monthly = renderForPlan("business", "monthly");
    assert.match(monthly.text, /Plan:\s*Business/i);
    assert.match(monthly.text, /Price:\s*\$199\/month/i);

    const annual = renderForPlan("business", "annual", "2027-08-29T00:00:00Z");
    assert.match(annual.text, /Price:\s*\$1,990\/year/i);
  });
});

describe("paid subscription activation delivery", () => {
  it("E — duplicate Paddle fulfillment does not send twice", async () => {
    const paidMock = createPaidLifecycleEventsMock();
    const sendCalls: string[] = [];

    const deps = {
      admin: buildWorkspaceAdmin(paidMock) as never,
      resolveOwnerFn: async () => ({
        ok: true as const,
        owner: { userId: "user-1", email: OWNER_EMAIL, displayName: "Alex" },
      }),
      sendEmailFn: async () => {
        sendCalls.push("send");
        return { success: true, messageId: "msg-1" };
      },
    };

    const input = {
      workspaceId: WORKSPACE_ID,
      providerSubscriptionId: PADDLE_SUBSCRIPTION_ID,
      plan: "starter" as const,
      billingInterval: "monthly" as const,
      periodEndsAt: PERIOD_END,
    };

    const first = await deliverPaidSubscriptionActivatedEmail(input, deps);
    const second = await deliverPaidSubscriptionActivatedEmail(input, deps);

    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.sent, true);
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.sent, false);
      assert.equal(second.reason, "already_sent");
    }
    assert.equal(sendCalls.length, 1);
    assert.equal(paidMock.rows.length, 1);
    assert.equal(paidMock.rows[0]?.metadata?.status, "sent");
  });

  it("F — subscription.updated does not send activation email", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installBillingMockForWebhook();
    seedPlan(state, WORKSPACE_ID, "starter");
    const existing = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    if (existing) {
      existing.plan = "starter";
      existing.status = "active";
      existing.payment_provider = "paddle";
      existing.provider_subscription_id = PADDLE_SUBSCRIPTION_ID;
      existing.current_period_ends_at = PERIOD_END;
    }

    const paidMock = createPaidLifecycleEventsMock();
    const sendCalls: string[] = [];

    const result = await processPaddleWebhookEvent(
      buildSubscriptionUpdatedEvent(PADDLE_SANDBOX_PRICE_CATALOG.starter.monthly)
    );
    assert.equal(result.ok, true);

    const delivery = await deliverPaidSubscriptionActivatedEmail(
      {
        workspaceId: WORKSPACE_ID,
        providerSubscriptionId: PADDLE_SUBSCRIPTION_ID,
        plan: "starter",
        billingInterval: "monthly",
        periodEndsAt: PERIOD_END,
      },
      {
        admin: buildWorkspaceAdmin(paidMock) as never,
        resolveOwnerFn: async () => ({
          ok: true as const,
          owner: { userId: "user-1", email: OWNER_EMAIL, displayName: null },
        }),
        sendEmailFn: async () => {
          sendCalls.push("send");
          return { success: true, messageId: "msg-1" };
        },
      }
    );

    assert.equal(delivery.ok, true);
    if (delivery.ok) assert.equal(delivery.sent, true);
    assert.equal(sendCalls.length, 1);
  });

  it("G — email provider failure does not undo paid entitlement", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installBillingMockForWebhook();

    const webhookResult = await processPaddleWebhookEvent(
      buildTransactionEvent(PADDLE_SANDBOX_PRICE_CATALOG.starter.monthly, "monthly")
    );
    assert.equal(webhookResult.ok, true);
    if (webhookResult.ok) {
      assert.equal(webhookResult.action, "fulfilled");
    }

    const subscription = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.plan, "starter");

    const paidMock = createPaidLifecycleEventsMock();
    const emailResult = await deliverPaidSubscriptionActivatedEmail(
      {
        workspaceId: WORKSPACE_ID,
        providerSubscriptionId: PADDLE_SUBSCRIPTION_ID,
        plan: "starter",
        billingInterval: "monthly",
        periodEndsAt: PERIOD_END,
      },
      {
        admin: buildWorkspaceAdmin(paidMock) as never,
        resolveOwnerFn: async () => ({
          ok: true as const,
          owner: { userId: "user-1", email: OWNER_EMAIL, displayName: null },
        }),
        sendEmailFn: async () => ({ success: false, error: "Resend unavailable" }),
      }
    );

    assert.equal(emailResult.ok, false);
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.plan, "starter");
    assert.equal(paidMock.rows[0]?.metadata?.status, "failed");
  });

  it("H — trial lifecycle remains suppressed after paid activation", async () => {
    const entitlement = resolveWorkspaceEntitlement({
      storedPlan: "starter",
      subscription: {
        status: "active",
        plan: "starter",
        trialStartsAt: "2026-08-01T00:00:00Z",
        trialEndsAt: "2026-08-15T00:00:00Z",
        trialConsumedAt: "2026-08-01T00:00:00Z",
        currentPeriodStartsAt: "2026-08-29T00:00:00Z",
        currentPeriodEndsAt: PERIOD_END,
      },
      now: new Date("2026-08-30T12:00:00.000Z"),
    });

    assert.deepEqual(getEligibleTrialLifecycleEvents(entitlement, "2026-08-15T00:00:00Z", new Date()), []);

    const trialResult = await deliverTrialLifecycleEmail(
      WORKSPACE_ID,
      "trial_started",
      {
        loadEntitlementFn: async () => entitlement,
        admin: {
          from() {
            throw new Error("trial delivery should short-circuit for paid workspace");
          },
        } as never,
      }
    );

    assert.equal(trialResult.ok, true);
    if (trialResult.ok) {
      assert.equal(trialResult.sent, false);
      assert.equal(trialResult.reason, "paid_workspace");
    }
  });

  it("I — workspace owner is the recipient", async () => {
    const paidMock = createPaidLifecycleEventsMock();
    const sent: Array<{ to: string | string[]; subject: string }> = [];

    const result = await deliverPaidSubscriptionActivatedEmail(
      {
        workspaceId: WORKSPACE_ID,
        providerSubscriptionId: PADDLE_SUBSCRIPTION_ID,
        plan: "starter",
        billingInterval: "monthly",
        periodEndsAt: PERIOD_END,
      },
      {
        admin: buildWorkspaceAdmin(paidMock) as never,
        resolveOwnerFn: async () => ({
          ok: true as const,
          owner: { userId: "owner-user", email: OWNER_EMAIL, displayName: "Jordan" },
        }),
        sendEmailFn: async (input) => {
          sent.push({ to: input.to, subject: input.subject });
          return { success: true, messageId: "msg-owner" };
        },
      }
    );

    assert.equal(result.ok, true);
    if (result.ok && result.sent) {
      assert.equal(result.recipientEmail, OWNER_EMAIL);
    }
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, OWNER_EMAIL);
    assert.match(String(sent[0]?.subject), /subscription is active/i);
  });

  it("J — enterprise does not enter paid activation flow", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const state = installBillingMockForWebhook();

    const unknownPriceResult = await processPaddleWebhookEvent(
      buildTransactionEvent("pri_enterprise_unknown", "monthly")
    );
    assert.equal(unknownPriceResult.ok, true);
    if (unknownPriceResult.ok) {
      assert.equal(unknownPriceResult.action, "ignored");
      assert.equal(unknownPriceResult.reason, "unknown_paddle_price");
    }

    const subscription = state.subscriptions.find((row) => row.workspace_id === WORKSPACE_ID);
    assert.equal(subscription?.status, "trial");

    const enterpriseResolution = resolvePlanFromPaddlePriceId("pri_enterprise_unknown", "sandbox");
    assert.equal(enterpriseResolution.ok, false);
  });
});

describe("paid lifecycle idempotency ledger", () => {
  it("reserves send slot once per provider subscription", async () => {
    const paidMock = createPaidLifecycleEventsMock();

    const first = await acquirePaidLifecycleSendSlot(
      WORKSPACE_ID,
      PADDLE_SUBSCRIPTION_ID,
      "paid_subscription_activated",
      paidMock.admin as never
    );
    const second = await acquirePaidLifecycleSendSlot(
      WORKSPACE_ID,
      PADDLE_SUBSCRIPTION_ID,
      "paid_subscription_activated",
      paidMock.admin as never
    );

    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    if (!second.acquired) {
      assert.equal(second.reason, "in_progress");
    }
  });
});

describe("paid lifecycle migration contract", () => {
  it("creates workspace_paid_lifecycle_events with provider subscription uniqueness", () => {
    const migration = readFileSync(
      "supabase/migrations/20260830140000_workspace_paid_lifecycle_events.sql",
      "utf8"
    );
    assert.match(migration, /workspace_paid_lifecycle_events/);
    assert.match(migration, /provider_subscription_id text NOT NULL/);
    assert.match(migration, /UNIQUE \(provider_subscription_id, event_key\)/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it("hooks activation enqueue only from transaction.completed handler", () => {
    const source = readFileSync(
      "lib/billing/paddle/webhook/processPaddleWebhookEvent.ts",
      "utf8"
    );
    const handlerStart = source.indexOf("async function handleTransactionCompleted");
    const handlerEnd = source.indexOf("export async function processPaddleWebhookEvent");
    assert.ok(handlerStart >= 0);
    assert.ok(handlerEnd > handlerStart);

    const callSites = [...source.matchAll(/enqueuePaidSubscriptionActivatedEmail\(/g)];
    assert.equal(callSites.length, 1);
    const callIndex = callSites[0]!.index!;
    assert.ok(callIndex >= handlerStart && callIndex < handlerEnd);
  });
});
