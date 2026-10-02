import "server-only";

import {
  isValidPaddleCustomerId,
  isValidPaddleSubscriptionId,
} from "./checkoutCustomerIdentity";
import { getPaddleApiKey, getPaddleEnvironment } from "./env.server";
import { logPortalFailure, type PortalFailureStage } from "./portalDiagnostics";
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
        | "paddle_environment_mismatch"
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
    logPortalFailure("subscription_lookup", error);
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

  const environment = getPaddleEnvironment();
  if (!environment) {
    logPortalFailure("configuration_validation");
    return { ok: false, code: "portal_unavailable", message: "Unable to open subscription management right now." };
  }
  if (environment !== "production" || subscription.paddleEnvironment !== "production") {
    return { ok: false, code: "paddle_environment_mismatch",
      message: "Subscription management is unavailable until Live billing is verified." };
  }

  const customerId = resolvePaddlePortalCustomerId(subscription);
  if (!customerId) {
    return {
      ok: false,
      code: "missing_paddle_customer",
      message: "Subscription management is unavailable until billing is connected.",
    };
  }

  let stage: PortalFailureStage = "configuration_validation";
  try {
    if (!getPaddleEnvironment() || !getPaddleApiKey()) {
      logPortalFailure(stage);
      return { ok: false, code: "portal_unavailable", message: "Unable to open subscription management right now." };
    }
    stage = "client_initialization";
    const paddle = getPaddleClientFn();
    stage = "portal_api_request";
    const session = await paddle.customerPortalSessions.create(
      customerId,
      resolvePortalSubscriptionIds(subscription)
    );

    stage = "response_validation";
    const overview = session?.urls?.general?.overview;
    const url = typeof overview === "string" ? overview.trim() : "";
    if (!url) {
      logPortalFailure(stage);
      return {
        ok: false,
        code: "portal_unavailable",
        message: "Unable to open subscription management right now.",
      };
    }

    return { ok: true, url };
  } catch (error) {
    logPortalFailure(stage, error);
    return {
      ok: false,
      code: "portal_unavailable",
      message: "Unable to open subscription management right now.",
    };
  }
}
