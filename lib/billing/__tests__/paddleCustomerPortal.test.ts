import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import { canManagePaddleSubscription } from "@/lib/billing/paddle/canManagePaddleSubscription";
import {
  createPaddleCustomerPortalSessionForWorkspace,
  resolvePaddlePortalCustomerId,
} from "@/lib/billing/paddle/createPaddleCustomerPortalSession";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const PADDLE_CUSTOMER_ID = "ctm_01m16x5zx5bf6zcmhmz94xqwa5";
const PADDLE_SUBSCRIPTION_ID = "sub_01m17skvvtbhfqk1380xtemyb8";

function paidPaddleSubscription(
  overrides: Partial<WorkspaceSubscriptionSnapshot> = {}
): WorkspaceSubscriptionSnapshot {
  return {
    status: "active",
    plan: "starter",
    billingInterval: "monthly",
    trialStartsAt: "2026-08-01T00:00:00Z",
    trialEndsAt: "2026-08-15T00:00:00Z",
    trialConsumedAt: "2026-08-01T00:00:00Z",
    currentPeriodStartsAt: "2026-08-29T00:00:00Z",
    currentPeriodEndsAt: "2026-09-29T00:00:00Z",
    cancelAtPeriodEnd: false,
    paymentProvider: "paddle",
    providerCustomerId: PADDLE_CUSTOMER_ID,
    providerSubscriptionId: PADDLE_SUBSCRIPTION_ID,
    ...overrides,
  };
}

describe("Paddle customer portal availability", () => {
  it("Paddle paid subscription + valid provider_customer_id => Manage subscription available", () => {
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "paid",
        paymentProvider: "paddle",
        providerCustomerId: PADDLE_CUSTOMER_ID,
      }),
      true
    );
  });

  it("No provider_customer_id => Manage subscription unavailable", () => {
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "paid",
        paymentProvider: "paddle",
        providerCustomerId: null,
      }),
      false
    );
  });

  it("Non-Paddle provider => Manage subscription unavailable", () => {
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "paid",
        paymentProvider: "manual",
        providerCustomerId: PADDLE_CUSTOMER_ID,
      }),
      false
    );
  });

  it("Free/trial-only state => Manage subscription unavailable", () => {
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "trial",
        paymentProvider: "paddle",
        providerCustomerId: PADDLE_CUSTOMER_ID,
      }),
      false
    );
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "trial_expired",
        paymentProvider: "paddle",
        providerCustomerId: PADDLE_CUSTOMER_ID,
      }),
      false
    );
  });
});

describe("Paddle customer portal session creation", () => {
  it("uses persisted workspace provider_customer_id and overview URL", async () => {
    const createCalls: Array<{ customerId: string; subscriptionIds: string[] }> = [];

    const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () => paidPaddleSubscription(),
      getPaddleClientFn: () => ({
        customerPortalSessions: {
          create: async (customerId, subscriptionIds) => {
            createCalls.push({ customerId, subscriptionIds });
            return {
              urls: {
                general: {
                  overview: "https://sandbox-customer-portal.paddle.com/session/test-overview",
                },
              },
            };
          },
        },
      }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.url, /^https:\/\//);
    }
    assert.deepEqual(createCalls, [
      {
        customerId: PADDLE_CUSTOMER_ID,
        subscriptionIds: [PADDLE_SUBSCRIPTION_ID],
      },
    ]);
  });

  it("does not attempt portal creation without provider_customer_id", async () => {
    let createCalled = false;

    const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () =>
        paidPaddleSubscription({ providerCustomerId: null }),
      getPaddleClientFn: () => ({
        customerPortalSessions: {
          create: async () => {
            createCalled = true;
            return { urls: { general: { overview: "https://example.com" } } };
          },
        },
      }),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "missing_paddle_customer");
    }
    assert.equal(createCalled, false);
  });

  it("returns portal_unavailable when Paddle session creation fails", async () => {
    const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () => paidPaddleSubscription(),
      getPaddleClientFn: () => ({
        customerPortalSessions: {
          create: async () => {
            throw new Error("Paddle unavailable");
          },
        },
      }),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "portal_unavailable");
    }
  });

  it("resolves portal customer id only from persisted subscription row", () => {
    assert.equal(
      resolvePaddlePortalCustomerId(paidPaddleSubscription()),
      PADDLE_CUSTOMER_ID
    );
    assert.equal(resolvePaddlePortalCustomerId(paidPaddleSubscription({ providerCustomerId: null })), null);
  });
});

describe("Paddle customer portal security wiring", () => {
  it("server action verifies workspace access before portal creation", () => {
    const actionSrc = readFileSync("app/[workspaceId]/settings/billingActions.ts", "utf8");
    assert.match(actionSrc, /requireWorkspace\(workspaceId\)/);
    assert.match(actionSrc, /createPaddleCustomerPortalSessionForWorkspace\(workspaceId\)/);
    assert.doesNotMatch(actionSrc, /customerId/);
  });

  it("client cannot provide or override Paddle customer ID", () => {
    const buttonSrc = readFileSync("components/billing/ManageSubscriptionButton.tsx", "utf8");
    const actionSrc = readFileSync("app/[workspaceId]/settings/billingActions.ts", "utf8");

    assert.match(buttonSrc, /openPaddleCustomerPortal\(workspaceId\)/);
    assert.doesNotMatch(buttonSrc, /customerId/);
    assert.doesNotMatch(actionSrc, /FormData/);
    assert.match(actionSrc, /openPaddleCustomerPortal\(\s*workspaceId: string/);
  });

  it("portal URL is returned ephemerally and not persisted", async () => {
    const portalModule = readFileSync(
      "lib/billing/paddle/createPaddleCustomerPortalSession.ts",
      "utf8"
    );
    assert.doesNotMatch(portalModule, /\.insert\(/);
    assert.doesNotMatch(portalModule, /\.upsert\(/);
    assert.doesNotMatch(portalModule, /\.update\(/);

    const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () => paidPaddleSubscription(),
      getPaddleClientFn: () => ({
        customerPortalSessions: {
          create: async () => ({
            urls: { general: { overview: "https://sandbox-customer-portal.paddle.com/temp" } },
          }),
        },
      }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.url, /sandbox-customer-portal/);
    }
  });

  it("BillingPlansClient shows Manage subscription only when server enables it", () => {
    const clientSrc = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(clientSrc, /canManageSubscription/);
    assert.match(clientSrc, /ManageSubscriptionButton/);
  });
});
