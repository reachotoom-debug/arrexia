/**
 * Canonical payment business-date contract (R2M).
 *
 * payment_date  — DATE business field (when the payment happened)
 * created_at    — TIMESTAMPTZ audit instant (when the record was created)
 */

import {
  formatDateOnlyField,
  getWorkspaceCalendarDate,
  normalizeDateOnlyString,
} from "@/lib/datetime/formatDateTime";

export function resolvePaymentBusinessDate(params: {
  paymentDate: string | null | undefined;
  createdAt: string | null | undefined;
  workspaceTimeZone: string | null | undefined;
}): string | null {
  const normalized = normalizeDateOnlyString(params.paymentDate);
  if (normalized) return normalized;

  if (params.createdAt) {
    return getWorkspaceCalendarDate(params.createdAt, params.workspaceTimeZone);
  }

  return null;
}

export function formatPaymentBusinessDate(params: {
  paymentDate: string | null | undefined;
  createdAt: string | null | undefined;
  workspaceTimeZone: string | null | undefined;
}): string {
  const resolved = resolvePaymentBusinessDate(params);
  if (!resolved) return "—";
  return formatDateOnlyField(resolved);
}
