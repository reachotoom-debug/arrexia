import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";

import { buildCheckoutOpenOptions } from "@/lib/billing/paddle/buildCheckoutOpenOptions";
import {
  getPaddleClientConfig,
  getPaddleClientConfigErrorMessage,
} from "@/lib/billing/paddle/clientConfig";
import {
  getPaddleCheckoutUxMessage,
  mapPaddleCheckoutUxPhase,
  PADDLE_CHECKOUT_SUCCESS_MESSAGE,
} from "@/lib/billing/paddle/checkoutUx";
import {
  isPaddleCheckoutErrorEvent,
} from "@/lib/billing/paddle/logPaddleCheckoutDev";
import { resolvePaddlePriceId } from "@/lib/billing/paddle/priceCatalog";

const ORIGINAL_ENV = {
  token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
  env: process.env.NEXT_PUBLIC_PADDLE_ENV,
};

describe("Paddle checkout configuration", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "test_client_token";
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = ORIGINAL_ENV.token;
    process.env.NEXT_PUBLIC_PADDLE_ENV = ORIGINAL_ENV.env;
  });

  it("resolves valid starter/pro/business monthly and annual prices for checkout", () => {
    for (const plan of ["starter", "pro", "business"] as const) {
      for (const interval of ["monthly", "annual"] as const) {
        const built = buildCheckoutOpenOptions({ plan, interval });
        assert.equal(built.ok, true);
        if (built.ok) {
          assert.match(built.priceId, /^pri_/);
          assert.equal(built.customData.plan, plan);
          assert.equal(built.customData.billing_interval, interval);
        }
      }
    }
  });

  it("builds checkout open options with workspace custom data and customer email", () => {
    const built = buildCheckoutOpenOptions({
      plan: "pro",
      interval: "annual",
      workspaceId: "ws_123",
      customerEmail: "owner@example.com",
    });

    assert.equal(built.ok, true);
    if (built.ok) {
      assert.equal(built.priceId, "pri_01m160evjx58qzrjge92aq8mrc");
      assert.equal(built.customData.workspace_id, "ws_123");
      assert.equal(built.customData.plan, "pro");
      assert.equal(built.customData.billing_interval, "annual");
      assert.deepEqual(built.checkoutCustomer, { email: "owner@example.com" });
    }
  });

  it("does not resolve enterprise to a checkout price", () => {
    const resolution = resolvePaddlePriceId("enterprise", "monthly");
    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.code, "CONTACT_SALES_ONLY");
    }
  });

  it("returns catalog-not-configured for production until a live catalog exists", () => {
    const built = buildCheckoutOpenOptions({
      plan: "starter",
      interval: "monthly",
      environment: "production",
    });
    assert.equal(built.ok, false);
    if (!built.ok) {
      assert.equal(built.code, "CATALOG_NOT_CONFIGURED");
    }
  });

  it("fails safely when the client token is missing", () => {
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const config = getPaddleClientConfig();
    assert.equal(config.ok, false);
    if (!config.ok) {
      assert.equal(config.code, "MISSING_CLIENT_TOKEN");
      assert.match(getPaddleClientConfigErrorMessage(config.code), /NEXT_PUBLIC_PADDLE_CLIENT_TOKEN/);
    }
  });

  it("initializes sandbox environment from NEXT_PUBLIC_PADDLE_ENV", () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const config = getPaddleClientConfig();
    assert.equal(config.ok, true);
    if (config.ok) {
      assert.equal(config.environment, "sandbox");
      assert.equal(config.token, "test_client_token");
    }
  });

  it("blocks production checkout until a live catalog is configured", () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
    const config = getPaddleClientConfig();
    assert.equal(config.ok, false);
    if (!config.ok) {
      assert.equal(config.code, "PRODUCTION_NOT_ENABLED");
    }
  });

  it("maps checkout completion to a neutral post-payment UX message", () => {
    assert.equal(mapPaddleCheckoutUxPhase("checkout.completed"), "completed");
    assert.equal(
      getPaddleCheckoutUxMessage("completed"),
      PADDLE_CHECKOUT_SUCCESS_MESSAGE
    );
    assert.match(PADDLE_CHECKOUT_SUCCESS_MESSAGE, /will activate after confirmation/i);
  });

  it("recognizes Paddle checkout error event names for dev diagnostics", () => {
    assert.equal(isPaddleCheckoutErrorEvent("checkout.error"), true);
    assert.equal(isPaddleCheckoutErrorEvent("checkout.payment.failed"), true);
    assert.equal(isPaddleCheckoutErrorEvent("checkout.loaded"), false);
  });
});

describe("Paddle checkout safety boundaries", () => {
  it("does not import entitlement mutation or Supabase billing writers in checkout modules", () => {
    const files = [
      "lib/billing/paddle/openPaddleCheckout.ts",
      "lib/billing/paddle/buildCheckoutOpenOptions.ts",
      "components/billing/PaddleCheckoutButton.tsx",
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
    ];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /changeWorkspacePlan/);
      assert.doesNotMatch(src, /setWorkspacePlanAction/);
      assert.doesNotMatch(src, /supabaseAdmin/);
      assert.doesNotMatch(src, /workspace_subscriptions/);
      assert.doesNotMatch(src, /PADDLE_API_KEY/);
    }
  });

  it("uses PaddleCheckoutButton instead of local plan mutation in billing settings UI", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(src, /PaddleCheckoutButton/);
    assert.match(src, /getBillingPlanCardCta/);
    assert.doesNotMatch(src, /setWorkspacePlanAction/);
  });
});
