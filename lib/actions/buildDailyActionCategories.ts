import { isOperationalReceivableInvoice } from "@/lib/receivables/operationalEligibility";
import {
  computeRequiringAttentionTotal,
  shouldShowAgingMilestoneAction,
  shouldShowEarlyOverdueAction,
} from "./collectionActivity";
import type {
  ActionReason,
  ChaseableInvoiceRow,
  CollectionActionItem,
  DailyActionCenterData,
} from "./types";

export function isChaseableInvoice(row: ChaseableInvoiceRow): boolean {
  return isOperationalReceivableInvoice({
    archivedAt: row.archivedAt,
    baseStatus: row.baseStatus,
    outstanding: row.outstanding,
    clientIsActive: row.clientIsActive,
    clientArchivedAt: row.clientArchivedAt,
  });
}

function triggerTier(reasons: ActionReason[]): number {
  if (reasons.some((reason) => reason.type === "reminder_due")) return 0;
  if (reasons.some((reason) => reason.type === "aging_milestone")) return 1;
  if (reasons.some((reason) => reason.type === "newly_overdue")) return 2;
  return 3;
}

function compareCollectionActions(a: CollectionActionItem, b: CollectionActionItem): number {
  const tierA = triggerTier(a.reasons);
  const tierB = triggerTier(b.reasons);
  if (tierA !== tierB) return tierA - tierB;

  if (a.isHighRisk !== b.isHighRisk) {
    return a.isHighRisk ? -1 : 1;
  }
  if (a.overdueDays !== b.overdueDays) {
    return b.overdueDays - a.overdueDays;
  }
  return b.outstanding - a.outstanding;
}

function toCollectionActionItem(
  row: ChaseableInvoiceRow,
  reasons: ActionReason[]
): CollectionActionItem {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    dueDate: row.dueDate,
    outstanding: row.outstanding,
    currency: row.currency,
    displayStatus: row.displayStatus,
    overdueDays: row.overdueDays,
    isHighRisk: row.riskLevel === "high",
    reasons,
  };
}

function buildActionReasons(params: {
  row: ChaseableInvoiceRow;
  reminderEligible: boolean;
  sentCalendarDates: readonly string[];
}): ActionReason[] {
  const { row, reminderEligible, sentCalendarDates } = params;
  const reasons: ActionReason[] = [];

  if (reminderEligible) {
    reasons.push({ type: "reminder_due" });
  }

  const milestone = shouldShowAgingMilestoneAction({
    isOverdue: row.isOverdue,
    overdueDays: row.overdueDays,
    dueDate: row.dueDate,
    sentCalendarDates,
  });
  if (milestone) {
    reasons.push({ type: "aging_milestone", milestoneDays: milestone });
  }

  if (
    shouldShowEarlyOverdueAction({
      isOverdue: row.isOverdue,
      overdueDays: row.overdueDays,
      dueDate: row.dueDate,
      sentCalendarDates,
    })
  ) {
    reasons.push({ type: "newly_overdue" });
  }

  return reasons;
}

export function buildDailyActionCategories(params: {
  invoices: ChaseableInvoiceRow[];
  reminderEligibleInvoiceIds: Set<string>;
  sentReminderDatesByInvoiceId: Map<string, string[]>;
  defaultCurrency: string;
  sentInvoiceCount: number;
}): Pick<DailyActionCenterData, "summary" | "collectionActions"> {
  const {
    invoices,
    reminderEligibleInvoiceIds,
    sentReminderDatesByInvoiceId,
    defaultCurrency,
    sentInvoiceCount,
  } = params;

  const collectionActionsById = new Map<string, CollectionActionItem>();

  for (const row of invoices) {
    if (!isChaseableInvoice(row)) continue;

    const sentCalendarDates = sentReminderDatesByInvoiceId.get(row.id) ?? [];
    const reasons = buildActionReasons({
      row,
      reminderEligible: reminderEligibleInvoiceIds.has(row.id),
      sentCalendarDates,
    });

    if (reasons.length === 0) continue;

    collectionActionsById.set(row.id, toCollectionActionItem(row, reasons));
  }

  const collectionActions = Array.from(collectionActionsById.values()).sort(
    compareCollectionActions
  );

  const requiringAttention = computeRequiringAttentionTotal({
    outstandingAmounts: collectionActions.map((action) => ({
      outstanding: action.outstanding,
      currency: action.currency,
    })),
    defaultCurrency,
  });

  const remindersDueCount = collectionActions.filter((action) =>
    action.reasons.some((reason) => reason.type === "reminder_due")
  ).length;

  const newlyOverdueCount = collectionActions.filter((action) =>
    action.reasons.some((reason) => reason.type === "newly_overdue")
  ).length;

  return {
    summary: {
      actionsTodayCount: collectionActions.length,
      requiringAttentionAmount: requiringAttention.amount,
      requiringAttentionCurrency: requiringAttention.currency,
      requiringAttentionMixedCurrency: requiringAttention.isMixedCurrency,
      remindersDueCount,
      newlyOverdueCount,
      sentInvoiceCount,
    },
    collectionActions,
  };
}
