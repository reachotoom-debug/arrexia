import "server-only";

import { getWorkspaceOwnerEmail } from "@/lib/billing/getWorkspaceOwnerEmail";

import { isValidPaddleCustomerId } from "./checkoutCustomerIdentity";
import { getPaddleEnvironment } from "./env.server";
import { loadWorkspaceSubscriptionWithProviders } from "./webhook/resolvePaddleWorkspace";

export type ResolvedPaddleCheckoutCustomer =
  | { ok: true; customerId?: string; customerEmail?: string }
  | { ok: false; reason: "no_owner" | "no_email" | "lookup_failed" | "billing_history_requires_review" | "existing_paid_subscription" };

type ResolveDeps = {
  loadSubscriptionFn?: typeof loadWorkspaceSubscriptionWithProviders;
  resolveOwnerFn?: typeof getWorkspaceOwnerEmail;
};

/**
 * Resolves the Paddle customer identity for a workspace checkout.
 * Prefers the workspace's stored provider_customer_id; otherwise uses canonical owner email.
 */
export async function resolvePaddleCheckoutCustomer(
  workspaceId: string,
  deps: ResolveDeps = {}
): Promise<ResolvedPaddleCheckoutCustomer> {
  const loadSubscriptionFn = deps.loadSubscriptionFn ?? loadWorkspaceSubscriptionWithProviders;
  const resolveOwnerFn = deps.resolveOwnerFn ?? getWorkspaceOwnerEmail;

  const subscription = await loadSubscriptionFn(workspaceId);
  // The shared database has one production billing projection per workspace.
  // Fulfillment cannot replace quarantined history, so do not offer a payment
  // that cannot activate. Customer email fallback would create a new identity.
  if (subscription?.paymentProvider === "paddle" && subscription.paddleEnvironment !== "production") {
    return { ok: false, reason: "billing_history_requires_review" };
  }
  if (subscription && (subscription.status === "active" || subscription.status === "past_due") &&
      ["starter", "pro", "business"].includes(subscription.plan)) {
    // A fresh checkout creates another subscription; the fulfillment RPC cannot
    // replace paid manual billing or a non-terminal Paddle subscription.
    return { ok: false, reason: "existing_paid_subscription" };
  }
  const providerCustomerId = subscription?.providerCustomerId ?? null;
  if (subscription?.paymentProvider === "paddle" && subscription.providerSubscriptionId &&
      (!isValidPaddleCustomerId(providerCustomerId) || !subscription.providerLastEventAt ||
       !Number.isFinite(Date.parse(subscription.providerLastEventAt)))) {
    // Replacing terminal Live history requires the original customer and a
    // known lifecycle boundary. An email fallback cannot satisfy that contract.
    return { ok: false, reason: "billing_history_requires_review" };
  }

  const environment = getPaddleEnvironment();
  if (environment && subscription?.paymentProvider === "paddle" &&
      subscription.paddleEnvironment === environment && isValidPaddleCustomerId(providerCustomerId)) {
    return { ok: true, customerId: providerCustomerId.trim() };
  }

  const ownerLookup = await resolveOwnerFn(workspaceId);
  if (!ownerLookup.ok) {
    return { ok: false, reason: ownerLookup.reason };
  }

  return { ok: true, customerEmail: ownerLookup.owner.email };
}
