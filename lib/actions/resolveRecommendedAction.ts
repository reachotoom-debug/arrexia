import type { ActionReason } from "./types";
import type { CollectionActionExecution } from "./resolveCollectionActionExecution";

/**
 * Deterministic recommended next step derived from existing reasons and execution mode.
 * Does not call AI or invent workflow states.
 */
export function resolveRecommendedAction(params: {
  reasons: ActionReason[];
  execution: CollectionActionExecution;
  isHighRisk: boolean;
}): string {
  const { reasons, execution, isHighRisk } = params;

  if (execution.mode === "view_only") {
    return "Review invoice";
  }

  const hasReminderDue = reasons.some((reason) => reason.type === "reminder_due");
  const hasMilestone = reasons.some((reason) => reason.type === "aging_milestone");
  const hasNewlyOverdue = reasons.some((reason) => reason.type === "newly_overdue");

  if (hasReminderDue) {
    return isHighRisk ? "Prioritize scheduled reminder" : "Send scheduled reminder";
  }

  if (hasMilestone) {
    return isHighRisk ? "Prioritize follow-up now" : "Follow up now";
  }

  if (hasNewlyOverdue) {
    return isHighRisk ? "Prioritize first follow-up" : "Send first follow-up";
  }

  if (execution.mode === "manual" || execution.mode === "rule_bound") {
    return isHighRisk ? "Prioritize follow-up" : "Send follow-up";
  }

  return "Review invoice";
}
