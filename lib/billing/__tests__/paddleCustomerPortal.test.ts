import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, it } from "node:test";

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
    paddleEnvironment: "production",
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
    paddleEnvironment: "production",
    checkoutEnvironment: "production",
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
    paddleEnvironment: "production",
    checkoutEnvironment: "production",
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
    paddleEnvironment: "production",
    checkoutEnvironment: "production",
        providerCustomerId: PADDLE_CUSTOMER_ID,
      }),
      false
    );
    assert.equal(
      canManagePaddleSubscription({
        entitlementState: "trial_expired",
        paymentProvider: "paddle",
    paddleEnvironment: "production",
    checkoutEnvironment: "production",
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
                  overview: "https://customer-portal.paddle.com/session/test-overview",
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
            urls: { general: { overview: "https://customer-portal.paddle.com/temp" } },
          }),
        },
      }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.url, /customer-portal/);
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

const savedPortalEnv = { environment: process.env.NEXT_PUBLIC_PADDLE_ENV, key: process.env.PADDLE_API_KEY };
beforeEach(() => { process.env.NEXT_PUBLIC_PADDLE_ENV = "production"; process.env.PADDLE_API_KEY = "test-key-never-log"; });
afterEach(() => {
  for (const [name, value] of [["NEXT_PUBLIC_PADDLE_ENV", savedPortalEnv.environment], ["PADDLE_API_KEY", savedPortalEnv.key]]) {
    if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
  }
});

describe("Paddle portal safe diagnostics", () => {
  for (const scenario of ["configuration_validation", "client_initialization", "portal_api_request", "response_validation", "subscription_lookup"] as const) {
    it(`reports ${scenario} without sensitive data`, async (t) => {
      const logs: unknown[][] = [];
      t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
      const secret = `test-key-never-log ${PADDLE_CUSTOMER_ID} ${PADDLE_SUBSCRIPTION_ID} https://portal.example/?token=private-token`;
      const error = Object.assign(new Error(secret), { code: "forbidden", status: 403, requestId: secret, body: secret });
      if (scenario === "configuration_validation") delete process.env.PADDLE_API_KEY;
      const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
        loadSubscriptionFn: async () => { if (scenario === "subscription_lookup") throw error; return paidPaddleSubscription(); },
        getPaddleClientFn: () => {
          if (scenario === "client_initialization") throw error;
          return { customerPortalSessions: { create: async () => {
            if (scenario === "portal_api_request") throw error;
            return { urls: { general: { overview: 123 } } } as never;
          } } };
        },
      });
      assert.equal(result.ok, false);
      assert.equal(logs.length, 1);
      assert.equal((logs[0][1] as {stage: string}).stage, scenario);
      assert.equal((logs[0][1] as {environment: string}).environment, "production");
      const serialized = JSON.stringify({logs, result});
      for (const value of ["test-key-never-log", PADDLE_CUSTOMER_ID, PADDLE_SUBSCRIPTION_ID, "private-token", "portal.example"]) assert.ok(!serialized.includes(value));
      assert.ok(!serialized.includes('"requestId"'));
      assert.ok(!serialized.includes('"httpStatus"'));
    });
  }
  it("rejects invalid environment before initializing a client", async (t) => {
    const logs: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
    process.env.NEXT_PUBLIC_PADDLE_ENV = "secret-environment-token";
    let initialized = false;
    const result = await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () => paidPaddleSubscription(),
      getPaddleClientFn: () => { initialized = true; throw new Error("must not initialize"); },
    });
    assert.equal(result.ok, false); assert.equal(initialized, false);
    assert.equal((logs[0][1] as {environment: unknown}).environment, null);
    assert.ok(!JSON.stringify(logs).includes("secret-environment-token"));
  });
  it("does not log arbitrary API error codes", async (t) => {
    const logs: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
    await createPaddleCustomerPortalSessionForWorkspace(WORKSPACE_ID, {
      loadSubscriptionFn: async () => paidPaddleSubscription(),
      getPaddleClientFn: () => ({customerPortalSessions: {create: async () => {throw {code: PADDLE_CUSTOMER_ID, message: "private-token"};}}}),
    });
    assert.equal((logs[0][1] as {errorCode: string}).errorCode, "unknown");
    assert.ok(!JSON.stringify(logs).includes(PADDLE_CUSTOMER_ID));
  });
});
