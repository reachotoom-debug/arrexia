import type { EntitlementState } from "@/lib/billing/resolveWorkspaceEntitlement";

import { isValidPaddleCustomerId } from "./checkoutCustomerIdentity";

export function canManagePaddleSubscription(input: {
  entitlementState: EntitlementState;
  paymentProvider: string | null | undefined;
  providerCustomerId: string | null | undefined;
}): boolean {
  if (input.entitlementState !== "paid") {
    return false;
  }

  if (input.paymentProvider !== "paddle") {
    return false;
  }

  return isValidPaddleCustomerId(input.providerCustomerId);
}
