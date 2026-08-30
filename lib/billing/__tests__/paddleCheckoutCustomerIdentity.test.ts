import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import { buildCheckoutOpenOptions } from "@/lib/billing/paddle/buildCheckoutOpenOptions";
import {
  buildPaddleCheckoutCustomerOpenArg,
  isValidPaddleCustomerId,
} from "@/lib/billing/paddle/checkoutCustomerIdentity";
import { resolvePaddleCheckoutCustomer } from "@/lib/billing/paddle/resolvePaddleCheckoutCustomer";
import { resolvePaddlePriceId } from "@/lib/billing/paddle/priceCatalog";

const WORKSPACE_A = "00000000-0000-0000-0000-000000000001";
const WORKSPACE_B = "00000000-0000-0000-0000-000000000002";
const PADDLE_CUSTOMER_A = "ctm_01m16x5zx5bf6zcmhmz94xqwa5";
const PADDLE_CUSTOMER_B = "ctm_01m16othercustomer0001";
const OWNER_EMAIL = "owner@example.com";
const MEMBER_EMAIL = "member@example.com";

describe("Paddle checkout customer identity", () => {
  it("uses workspace owner email for first checkout when provider_customer_id is missing", async () => {
    const resolved = await resolvePaddleCheckoutCustomer(WORKSPACE_A, {
      loadSubscriptionFn: async () => null,
      resolveOwnerFn: async () => ({
        ok: true,
        owner: { userId: "user-owner", email: OWNER_EMAIL, displayName: null },
      }),
    });

    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.customerEmail, OWNER_EMAIL);
      assert.equal(resolved.customerId, undefined);
    }
  });

  it("does not use a logged-in non-owner session email when owner email is canonical", async () => {
    const settingsPage = readFileSync("app/[workspaceId]/settings/page.tsx", "utf8");
    assert.doesNotMatch(settingsPage, /customerEmail=\{profile\?\.email/);

    const resolved = await resolvePaddleCheckoutCustomer(WORKSPACE_A, {
      loadSubscriptionFn: async () => null,
      resolveOwnerFn: async () => ({
        ok: true,
        owner: { userId: "user-owner", email: OWNER_EMAIL, displayName: null },
      }),
    });

    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.notEqual(resolved.customerEmail, MEMBER_EMAIL);
      assert.equal(resolved.customerEmail, OWNER_EMAIL);
    }
  });

  it("reuses existing provider_customer_id for the workspace", async () => {
    const resolved = await resolvePaddleCheckoutCustomer(WORKSPACE_A, {
      loadSubscriptionFn: async (workspaceId) => {
        assert.equal(workspaceId, WORKSPACE_A);
        return {
          status: "active",
          plan: "starter",
          trialStartsAt: null,
          trialEndsAt: null,
          trialConsumedAt: null,
          currentPeriodStartsAt: "2026-08-29T00:00:00Z",
          currentPeriodEndsAt: "2026-09-29T00:00:00Z",
          providerCustomerId: PADDLE_CUSTOMER_A,
          providerSubscriptionId: "sub_test",
          paymentProvider: "paddle",
          providerLastEventAt: null,
        };
      },
      resolveOwnerFn: async () => {
        throw new Error("owner lookup should not run when provider customer exists");
      },
    });

    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.customerId, PADDLE_CUSTOMER_A);
      assert.equal(resolved.customerEmail, undefined);
    }
  });

  it("preserves workspace isolation for stored provider_customer_id", async () => {
    const subscriptions = new Map([
      [
        WORKSPACE_A,
        {
          providerCustomerId: PADDLE_CUSTOMER_A,
        },
      ],
      [
        WORKSPACE_B,
        {
          providerCustomerId: PADDLE_CUSTOMER_B,
        },
      ],
    ]);

    async function loadSubscription(workspaceId: string) {
      const row = subscriptions.get(workspaceId);
      if (!row) return null;
      return {
        status: "active" as const,
        plan: "starter" as const,
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        providerCustomerId: row.providerCustomerId,
        providerSubscriptionId: "sub_test",
        paymentProvider: "paddle",
        providerLastEventAt: null,
      };
    }

    const resolvedA = await resolvePaddleCheckoutCustomer(WORKSPACE_A, {
      loadSubscriptionFn: loadSubscription,
    });
    const resolvedB = await resolvePaddleCheckoutCustomer(WORKSPACE_B, {
      loadSubscriptionFn: loadSubscription,
    });

    assert.equal(resolvedA.ok, true);
    assert.equal(resolvedB.ok, true);
    if (resolvedA.ok && resolvedB.ok) {
      assert.equal(resolvedA.customerId, PADDLE_CUSTOMER_A);
      assert.equal(resolvedB.customerId, PADDLE_CUSTOMER_B);
    }
  });

  it("falls back to owner email when provider_customer_id is missing or invalid", async () => {
    const resolved = await resolvePaddleCheckoutCustomer(WORKSPACE_A, {
      loadSubscriptionFn: async () => ({
        status: "trial",
        plan: "free",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        providerCustomerId: "not-a-paddle-customer",
        providerSubscriptionId: null,
        paymentProvider: null,
        providerLastEventAt: null,
      }),
      resolveOwnerFn: async () => ({
        ok: true,
        owner: { userId: "user-owner", email: OWNER_EMAIL, displayName: null },
      }),
    });

    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.customerEmail, OWNER_EMAIL);
      assert.equal(resolved.customerId, undefined);
    }
  });

  it("builds Paddle Checkout.open customer.id when provider customer exists", () => {
    const built = buildCheckoutOpenOptions({
      plan: "starter",
      interval: "monthly",
      workspaceId: WORKSPACE_A,
      customerId: PADDLE_CUSTOMER_A,
    });

    assert.equal(built.ok, true);
    if (built.ok) {
      assert.deepEqual(built.checkoutCustomer, { id: PADDLE_CUSTOMER_A });
      assert.equal(built.customData.workspace_id, WORKSPACE_A);
      assert.equal(built.customData.plan, "starter");
      assert.equal(built.customData.billing_interval, "monthly");
    }
  });

  it("builds Paddle Checkout.open customer.email for first checkout", () => {
    const built = buildCheckoutOpenOptions({
      plan: "pro",
      interval: "annual",
      workspaceId: WORKSPACE_A,
      customerEmail: OWNER_EMAIL,
    });

    assert.equal(built.ok, true);
    if (built.ok) {
      assert.deepEqual(built.checkoutCustomer, { email: OWNER_EMAIL });
      assert.equal(built.customData.workspace_id, WORKSPACE_A);
      assert.equal(built.customData.plan, "pro");
      assert.equal(built.customData.billing_interval, "annual");
    }
  });

  it("prefers provider customer id over owner email when both are supplied", () => {
    const customer = buildPaddleCheckoutCustomerOpenArg({
      customerId: PADDLE_CUSTOMER_A,
      customerEmail: MEMBER_EMAIL,
    });

    assert.deepEqual(customer, { id: PADDLE_CUSTOMER_A });
  });

  it("validates Paddle customer ids before reuse", () => {
    assert.equal(isValidPaddleCustomerId(PADDLE_CUSTOMER_A), true);
    assert.equal(isValidPaddleCustomerId("manual_customer"), false);
    assert.equal(isValidPaddleCustomerId(""), false);
  });

  it("does not resolve enterprise to a checkout price", () => {
    const resolution = resolvePaddlePriceId("enterprise", "monthly");
    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.code, "CONTACT_SALES_ONLY");
    }
  });
});

describe("Paddle checkout customer identity wiring", () => {
  it("resolves checkout customer server-side in BillingPlans", () => {
    const billingPlans = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlans.tsx",
      "utf8"
    );
    const settingsPage = readFileSync("app/[workspaceId]/settings/page.tsx", "utf8");
    assert.match(billingPlans, /resolvePaddleCheckoutCustomer/);
    assert.doesNotMatch(settingsPage, /customerEmail=\{profile/);
  });

  it("passes customer id to Checkout.open when supported by paddle-js types", () => {
    const openCheckout = readFileSync("lib/billing/paddle/openPaddleCheckout.ts", "utf8");
    assert.match(openCheckout, /checkoutOptions\.checkoutCustomer/);
    assert.match(openCheckout, /customer: checkoutOptions\.checkoutCustomer/);

    const paddleTypes = readFileSync(
      "node_modules/@paddle/paddle-js/types/checkout/customer.d.ts",
      "utf8"
    );
    assert.match(paddleTypes, /interface CheckoutCustomerId/);
    assert.match(paddleTypes, /id: string;/);
  });
});
