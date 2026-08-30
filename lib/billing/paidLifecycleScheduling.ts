/**
 * Non-server-only scheduling hook for paid lifecycle emails.
 * Safe to import from modules exercised in node:test without server-only shims.
 */

import type { PaidSubscriptionActivatedDeliveryInput } from "./paidLifecycleDelivery";

export async function schedulePaidSubscriptionActivatedEmail(
  input: PaidSubscriptionActivatedDeliveryInput
): Promise<void> {
  try {
    const { deliverPaidSubscriptionActivatedEmail } = await import(
      "@/lib/billing/paidLifecycleDelivery"
    );
    await deliverPaidSubscriptionActivatedEmail(input);
  } catch (error) {
    console.error(
      `[paid-lifecycle] paid_subscription_activated delivery failed for ${input.workspaceId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/** Fire-and-forget wrapper used after successful Paddle paid activation. */
export function enqueuePaidSubscriptionActivatedEmail(
  input: PaidSubscriptionActivatedDeliveryInput
): void {
  void schedulePaidSubscriptionActivatedEmail(input);
}
