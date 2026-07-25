import { NON_COLLECTIBLE_BASE_STATUSES } from "@/lib/reminders/eligibility";
import type {
  ChaseableInvoiceRow,
  DailyActionCenterData,
  HighRiskItem,
  NeedsActionItem,
  NeedsActionReason,
} from "./types";

const HIGH_RISK_DISPLAY_LIMIT = 10;

export function isChaseableInvoice(row: ChaseableInvoiceRow): boolean {
  if (row.archivedAt != null) return false;
  if (!(row.outstanding > 0)) return false;
  if (!row.clientIsActive) return false;
  if (row.clientArchivedAt != null) return false;
  const base = (row.baseStatus ?? "").toLowerCase();
  if ((NON_COLLECTIBLE_BASE_STATUSES as readonly string[]).includes(base)) {
    return false;
  }
  return true;
}

export function isOverdueChaseable(row: ChaseableInvoiceRow): boolean {
  return isChaseableInvoice(row) && row.isOverdue;
}

function reasonFlags(reasons: NeedsActionReason[]) {
  return {
    reminderDue: reasons.includes("reminder_due"),
    highRisk: reasons.includes("high_risk"),
    newlyOverdue: reasons.includes("newly_overdue"),
  };
}

function compareNeedsActionItems(a: NeedsActionItem, b: NeedsActionItem): number {
  const aFlags = reasonFlags(a.reasons);
  const bFlags = reasonFlags(b.reasons);

  if (aFlags.reminderDue !== bFlags.reminderDue) {
    return aFlags.reminderDue ? -1 : 1;
  }
  if (aFlags.highRisk !== bFlags.highRisk) {
    return aFlags.highRisk ? -1 : 1;
  }
  if (aFlags.newlyOverdue !== bFlags.newlyOverdue) {
    return aFlags.newlyOverdue ? -1 : 1;
  }
  if (a.overdueDays !== b.overdueDays) {
    return b.overdueDays - a.overdueDays;
  }
  return b.outstanding - a.outstanding;
}

function compareHighRiskItems(a: HighRiskItem, b: HighRiskItem): number {
  if (a.outstanding !== b.outstanding) {
    return b.outstanding - a.outstanding;
  }
  return b.overdueDays - a.overdueDays;
}

function toNeedsActionItem(
  row: ChaseableInvoiceRow,
  reasons: NeedsActionReason[]
): NeedsActionItem {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    clientName: row.clientName,
    dueDate: row.dueDate,
    outstanding: row.outstanding,
    currency: row.currency,
    displayStatus: row.displayStatus,
    overdueDays: row.overdueDays,
    reasons,
  };
}

function toHighRiskItem(row: ChaseableInvoiceRow): HighRiskItem {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    clientName: row.clientName,
    dueDate: row.dueDate,
    outstanding: row.outstanding,
    currency: row.currency,
    overdueDays: row.overdueDays,
  };
}

export function buildDailyActionCategories(params: {
  invoices: ChaseableInvoiceRow[];
  reminderEligibleInvoiceIds: Set<string>;
  /** Eligible reminder occurrences (invoice × rule rows). */
  remindersDueRowCount: number;
}): Pick<DailyActionCenterData, "summary" | "needsAction" | "highRisk"> {
  const { invoices, reminderEligibleInvoiceIds, remindersDueRowCount } = params;

  const chaseableOverdue = invoices.filter(isOverdueChaseable);
  const overdueCount = chaseableOverdue.length;

  const highRiskAll = chaseableOverdue
    .filter((row) => row.riskLevel === "high")
    .slice()
    .sort(compareHighRiskItems);

  const highRiskCount = highRiskAll.length;
  const highRisk = highRiskAll.slice(0, HIGH_RISK_DISPLAY_LIMIT);

  const needsActionById = new Map<string, NeedsActionItem>();

  for (const row of invoices) {
    if (!isChaseableInvoice(row)) continue;

    const reasons: NeedsActionReason[] = [];
    if (reminderEligibleInvoiceIds.has(row.id)) {
      reasons.push("reminder_due");
    }
    if (row.isOverdue && row.riskLevel === "high") {
      reasons.push("high_risk");
    }
    if (row.isOverdue && row.overdueDays === 1) {
      reasons.push("newly_overdue");
    }

    if (reasons.length === 0) continue;

    needsActionById.set(row.id, toNeedsActionItem(row, reasons));
  }

  const needsAction = Array.from(needsActionById.values()).sort(compareNeedsActionItems);

  return {
    summary: {
      needsActionCount: needsAction.length,
      remindersDueCount: remindersDueRowCount,
      highRiskCount,
      overdueCount,
    },
    needsAction,
    highRisk,
  };
}
