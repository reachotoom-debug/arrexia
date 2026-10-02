import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import "./testSetup";
import type { EventEntity } from "@paddle/paddle-node-sdk";
import { processPaddleWebhookEvent } from "../paddle/webhook/processPaddleWebhookEvent";
import { PADDLE_PRODUCTION_PRICE_CATALOG } from "../paddle/priceCatalog";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";
import { createBillingMockAdmin, createBillingMockState, seedWorkspace, seedPlan, seedSubscription } from "./billingMutationMock";
afterEach(() => setSupabaseAdminClientForTests(null));
it("passes verified recurring transaction identity, actual totals and period to the atomic notification RPC", async () => {
  process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
  const state = createBillingMockState(); const ws = "00000000-0000-0000-0000-000000000011";
  seedWorkspace(state, ws); seedPlan(state, ws, "starter");
  seedSubscription(state, ws, { payment_provider: "paddle", paddle_environment: "production", status: "active", plan: "starter", provider_subscription_id: "sub_fixture", provider_customer_id: "ctm_fixture", trial_starts_at: null, trial_ends_at: null, current_period_starts_at: "2026-09-01T00:00:00Z", current_period_ends_at: "2026-10-01T00:00:00Z" });
  const admin = createBillingMockAdmin(state); const originalRpc = admin.rpc.bind(admin);
  let captured: Record<string, unknown> = {};
  Object.defineProperty(admin, "rpc", { value: async (name: string, params: Record<string, unknown>) => {
    const result = await originalRpc(name, params);
    if(name === "rpc_apply_paddle_webhook") { captured = params.p_payload as Record<string, unknown>; return { ...result, data: { ...result.data, notification_id: "fixture-notification" } }; }
    return result;
  } });
  setSupabaseAdminClientForTests(admin);
  const event = { eventId: "evt_recurring", eventType: "transaction.completed", occurredAt: "2026-10-01T00:00:00Z", data: {
    id: "txn_fixture", origin: "subscription_recurring", status: "completed", subscriptionId: "sub_fixture", customerId: "ctm_fixture", currencyCode: "USD",
    details: { totals: { total: "3510" } }, items: [{ price: { id: PADDLE_PRODUCTION_PRICE_CATALOG.starter.monthly } }],
    billingPeriod: { startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" },
  } } as unknown as EventEntity;
  const result = await processPaddleWebhookEvent(event);
  assert.equal(result.ok, true);
  if(result.ok) assert.equal(result.notificationId, "fixture-notification");
  assert.equal(captured.transaction_origin, "subscription_recurring");
  assert.equal(captured.transaction_id, "txn_fixture");
  assert.deepEqual(captured.transaction_totals, { total: "3510", currency_code: "USD" });
  assert.equal(captured.period_ends_at, "2026-11-01T00:00:00Z");
});
