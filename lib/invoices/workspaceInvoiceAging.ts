/**
 * Pure workspace invoice aging helpers (R2I).
 * Mirrors invoices_view semantics using the same workspace-calendar contract
 * as reminder evaluation — for tests and documentation, not runtime view calc.
 */

import {
  instantToWorkspaceCalendarDate,
  resolveSafeTimeZone,
} from "@/lib/datetime/formatDateTime";
import { differenceCalendarDays } from "@/lib/reminders/ruleTrigger";

export type InvoiceDisplayStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "partially_paid"
  | "void";

export type InvoiceRiskLevel = "high" | "medium" | "low" | null;

/** Workspace-local YYYY-MM-DD for a UTC instant (matches SQL workspace_business_date). */
export function resolveWorkspaceBusinessDate(
  referenceInstant: Date,
  workspaceTimeZone: string | null | undefined
): string {
  return (
    instantToWorkspaceCalendarDate(referenceInstant, resolveSafeTimeZone(workspaceTimeZone)) ??
    referenceInstant.toISOString().slice(0, 10)
  );
}

export function computeInvoiceOverdueDays(params: {
  dueDate: string | null;
  workspaceToday: string;
}): number {
  if (!params.dueDate) return 0;
  if (params.dueDate >= params.workspaceToday) return 0;
  return Math.max(0, differenceCalendarDays(params.workspaceToday, params.dueDate) ?? 0);
}

/** Mirrors invoices_view display_status precedence (timezone-aware due_date compare). */
export function computeInvoiceDisplayStatus(params: {
  baseStatus: string;
  outstanding: number;
  paid: number;
  dueDate: string | null;
  workspaceToday: string;
}): InvoiceDisplayStatus | string {
  const { baseStatus, outstanding, paid, dueDate, workspaceToday } = params;

  if (baseStatus === "void") return "void";
  if (baseStatus === "draft") return "draft";
  if (outstanding <= 0) return "paid";
  if (baseStatus === "sent" && outstanding > 0 && dueDate != null && dueDate < workspaceToday) {
    return "overdue";
  }
  if (baseStatus === "sent" && outstanding > 0 && dueDate != null && dueDate >= workspaceToday) {
    if (paid > 0 && outstanding > 0) return "partially_paid";
    return "sent";
  }
  return baseStatus;
}

/** Mirrors invoices_view risk_level thresholds exactly. */
export function computeInvoiceRiskLevel(params: {
  displayStatus: string;
  overdueDays: number;
  outstanding: number;
}): InvoiceRiskLevel {
  if (params.displayStatus !== "overdue") return null;
  if (params.overdueDays >= 60 || params.outstanding >= 5000) return "high";
  if (params.overdueDays >= 15 && params.overdueDays <= 59) return "medium";
  if (params.overdueDays >= 1 && params.overdueDays <= 14) return "low";
  return null;
}

export function evaluateWorkspaceInvoiceAging(params: {
  baseStatus: string;
  outstanding: number;
  paid: number;
  dueDate: string | null;
  referenceInstant: Date;
  workspaceTimeZone: string | null | undefined;
}) {
  const workspaceToday = resolveWorkspaceBusinessDate(
    params.referenceInstant,
    params.workspaceTimeZone
  );
  const overdueDays = computeInvoiceOverdueDays({
    dueDate: params.dueDate,
    workspaceToday,
  });
  const displayStatus = computeInvoiceDisplayStatus({
    baseStatus: params.baseStatus,
    outstanding: params.outstanding,
    paid: params.paid,
    dueDate: params.dueDate,
    workspaceToday,
  });
  const riskLevel = computeInvoiceRiskLevel({
    displayStatus,
    overdueDays,
    outstanding: params.outstanding,
  });

  return {
    workspaceToday,
    overdueDays,
    displayStatus,
    isOverdue: displayStatus === "overdue",
    riskLevel,
  };
}
