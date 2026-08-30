import "server-only";

import {
  isValidPaddleCustomerId,
  isValidPaddleSubscriptionId,
} from "./checkoutCustomerIdentity";
import { getPaddleServerClient } from "./serverClient";
import {
  loadWorkspaceSubscription,
  type WorkspaceSubscriptionSnapshot,
} from "../workspaceSubscription";

export type CreatePaddleCustomerPortalSessionResult =
  | { ok: true; url: string }
  | {
      ok: false;
      code:
        | "missing_paddle_customer"
        | "not_paddle_subscription"
        | "portal_unavailable"
        | "subscription_lookup_failed";
      message: string;
    };

type PaddlePortalClient = {
  customerPortalSessions: {
    create: (
      customerId: string,
      subscriptionIds: string[]
    ) => Promise<{ urls: { general: { overview: string } } }>;
  };
};

type CreatePortalDeps = {
  loadSubscriptionFn?: typeof loadWorkspaceSubscription;
  getPaddleClientFn?: () => PaddlePortalClient;
};

function resolvePortalSubscriptionIds(
  subscription: WorkspaceSubscriptionSnapshot | null
): string[] {
  const providerSubscriptionId = subscription?.providerSubscriptionId ?? null;
  if (!isValidPaddleSubscriptionId(providerSubscriptionId)) {
    return [];
  }
  return [providerSubscriptionId.trim()];
}

export function resolvePaddlePortalCustomerId(
  subscription: WorkspaceSubscriptionSnapshot | null
): string | null {
  const providerCustomerId = subscription?.providerCustomerId ?? null;
  return isValidPaddleCustomerId(providerCustomerId) ? providerCustomerId.trim() : null;
}

/**
 * Mints a fresh Paddle customer portal overview URL for a workspace.
 * Caller must verify workspace access before invoking.
 */
export async function createPaddleCustomerPortalSessionForWorkspace(
  workspaceId: string,
  deps: CreatePortalDeps = {}
): Promise<CreatePaddleCustomerPortalSessionResult> {
  const loadSubscriptionFn = deps.loadSubscriptionFn ?? loadWorkspaceSubscription;
  const getPaddleClientFn = deps.getPaddleClientFn ?? getPaddleServerClient;

  let subscription: WorkspaceSubscriptionSnapshot | null;
  try {
    subscription = await loadSubscriptionFn(workspaceId);
  } catch (error) {
    console.error(
      `[paddle/portal] subscription lookup failed for ${workspaceId}:`,
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      code: "subscription_lookup_failed",
      message: "Unable to load subscription details.",
    };
  }

  if (subscription?.paymentProvider !== "paddle") {
    return {
      ok: false,
      code: "not_paddle_subscription",
      message: "Subscription management is unavailable for this workspace.",
    };
  }

  const customerId = resolvePaddlePortalCustomerId(subscription);
  if (!customerId) {
    return {
      ok: false,
      code: "missing_paddle_customer",
      message: "Subscription management is unavailable until billing is connected.",
    };
  }

  try {
    const paddle = getPaddleClientFn();
    const session = await paddle.customerPortalSessions.create(
      customerId,
      resolvePortalSubscriptionIds(subscription)
    );

    const url = session.urls.general.overview?.trim();
    if (!url) {
      return {
        ok: false,
        code: "portal_unavailable",
        message: "Paddle customer portal is temporarily unavailable.",
      };
    }

    return { ok: true, url };
  } catch (error) {
    console.error(
      `[paddle/portal] session creation failed for ${workspaceId}:`,
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      code: "portal_unavailable",
      message: "Unable to open subscription management right now.",
    };
  }
}
