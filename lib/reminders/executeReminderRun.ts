/**
 * Executes canonical eligible reminder candidates (R2C).
 * Kept separate from send.ts so unit tests can import without server/email deps.
 */

import type { EligibleReminderCandidate } from "./getEligibleReminders";

export interface ReminderExecutionSummary {
  candidatesEligible: number;
  /** Backward-compatible alias for candidatesEligible. */
  invoicesProcessed: number;
  remindersSent: number;
  remindersFailed: number;
  remindersSkipped: number;
  errors: Array<{ invoiceId: string; ruleId?: string; error: string }>;
}

export type SendReminderOutcome = {
  success: boolean;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
  message?: string;
};

export type SendReminderForInvoiceFn = (options: {
  workspaceId: string;
  invoiceId: string;
  ruleId: string;
  templateId: string | null;
  scheduledDate: string;
  source: "auto_cron";
  userId: null;
}) => Promise<SendReminderOutcome>;

export async function executeEligibleReminderCandidates(
  workspaceId: string,
  candidates: EligibleReminderCandidate[],
  sendReminder: SendReminderForInvoiceFn
): Promise<ReminderExecutionSummary> {
  const result: ReminderExecutionSummary = {
    candidatesEligible: candidates.length,
    invoicesProcessed: candidates.length,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
    errors: [],
  };

  for (const candidate of candidates) {
    try {
      const sendResult = await sendReminder({
        workspaceId,
        invoiceId: candidate.invoiceId,
        ruleId: candidate.ruleId,
        templateId: candidate.templateId,
        scheduledDate: candidate.scheduledDate,
        source: "auto_cron",
        userId: null,
      });

      if (sendResult.success && sendResult.status === "sent") {
        result.remindersSent++;
        continue;
      }

      if (sendResult.status === "skipped") {
        result.remindersSkipped++;
        continue;
      }

      result.remindersFailed++;
      result.errors.push({
        invoiceId: candidate.invoiceId,
        ruleId: candidate.ruleId,
        error: sendResult.errorMessage || sendResult.message || "Unknown error",
      });
    } catch (err) {
      result.remindersFailed++;
      result.errors.push({
        invoiceId: candidate.invoiceId,
        ruleId: candidate.ruleId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
