import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import "./testSetup";
import { PADDLE_PRODUCTION_PRICE_CATALOG } from "../paddle/priceCatalog";
import { processPaddleWebhookEvent } from "../paddle/webhook/processPaddleWebhookEvent";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";
import { createBillingMockState, createBillingMockAdmin, seedWorkspace, seedPlan, seedSubscription } from "./billingMutationMock";
import type { EventEntity } from "@paddle/paddle-node-sdk";
const workspace = "00000000-0000-0000-0000-000000000001";
afterEach(() => setSupabaseAdminClientForTests(null));
describe("Live monthly and annual renewal synchronization", () => {
  for (const plan of ["starter","pro","business"] as const) for (const cadence of ["monthly","annual"] as const) {
    it(`${plan} ${cadence}: lifecycle extends period; completed transactions cannot roll it back`, async () => {
      process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
      const state = createBillingMockState();
      seedWorkspace(state,workspace); seedPlan(state,workspace,"free");
      seedSubscription(state,workspace,{plan:"free",status:"trial",payment_provider:"manual",
        trial_starts_at:"2026-08-01",trial_ends_at:"2026-08-15",trial_consumed_at:"2026-08-01",
        current_period_starts_at:null,current_period_ends_at:null});
      setSupabaseAdminClientForTests(createBillingMockAdmin(state));
      const firstEnd = cadence === "monthly" ? "2026-10-01T00:00:00Z" : "2027-09-01T00:00:00Z";
      const renewalEnd = cadence === "monthly" ? "2026-11-01T00:00:00Z" : "2028-09-01T00:00:00Z";
      const event = (id:string,at:string,start:string,end:string):EventEntity => ({eventId:id,eventType:"subscription.updated",occurredAt:at,
        data:{id:"sub_live_fixture",customer_id:"ctm_live_fixture",status:"active",custom_data:{workspace_id:workspace},
          items:[{price:{id:PADDLE_PRODUCTION_PRICE_CATALOG[plan][cadence]}}],current_billing_period:{starts_at:start,ends_at:end}}} as unknown as EventEntity);
      assert.equal((await processPaddleWebhookEvent(event("evt_first","2026-09-01T00:00:00Z","2026-09-01T00:00:00Z",firstEnd))).ok,true);
      assert.equal((await processPaddleWebhookEvent(event("evt_renewal",firstEnd,firstEnd,renewalEnd))).ok,true);
      const before = structuredClone(state.subscriptions[0]);
      const renewal = event("evt_old_transaction",firstEnd,"2026-09-01T00:00:00Z",firstEnd) as unknown as Record<string,unknown>;
      renewal.eventType="transaction.completed";
      Object.assign(renewal.data as object,{status:"completed",subscription_id:"sub_live_fixture"});
      const result = await processPaddleWebhookEvent(renewal as unknown as EventEntity);
      assert.equal(result.ok,true);
      assert.deepEqual(state.subscriptions[0],before);
      assert.equal(before.plan,plan); assert.equal(before.billing_interval,cadence);
      assert.equal(before.current_period_ends_at,renewalEnd);
      assert.equal(before.paddle_environment,"production");
      assert.equal(before.trial_consumed_at,"2026-08-01");
    });
  }
});
