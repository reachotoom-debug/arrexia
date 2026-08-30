import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";

/** Cancellation-aware paid period end copy for billing settings UI. */
export function formatPaidSubscriptionPeriodEndMessage(
  periodEndsAt: string,
  cancelAtPeriodEnd: boolean
): string {
  const formattedDate = formatDateOnlyField(periodEndsAt);
  if (cancelAtPeriodEnd) {
    return `Access until ${formattedDate}`;
  }
  return `Renews ${formattedDate}`;
}
