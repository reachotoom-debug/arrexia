import "server-only";

import { getWorkspaceOwnerEmail } from "@/lib/billing/getWorkspaceOwnerEmail";

import { isValidPaddleCustomerId } from "./checkoutCustomerIdentity";
import { loadWorkspaceSubscriptionWithProviders } from "./webhook/resolvePaddleWorkspace";

export type ResolvedPaddleCheckoutCustomer =
  | { ok: true; customerId?: string; customerEmail?: string }
  | { ok: false; reason: "no_owner" | "no_email" | "lookup_failed" };

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
  const providerCustomerId = subscription?.providerCustomerId ?? null;

  if (isValidPaddleCustomerId(providerCustomerId)) {
    return { ok: true, customerId: providerCustomerId.trim() };
  }

  const ownerLookup = await resolveOwnerFn(workspaceId);
  if (!ownerLookup.ok) {
    return { ok: false, reason: ownerLookup.reason };
  }

  return { ok: true, customerEmail: ownerLookup.owner.email };
}
