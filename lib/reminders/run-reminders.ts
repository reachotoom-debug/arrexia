/**
 * Automated reminder runner (R2C).
 * Uses canonical getEligibleReminders() — same contract as Suggested Reminders.
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getEligibleReminders } from "./getEligibleReminders";
import { executeEligibleReminderCandidates } from "./executeReminderRun";
import { sendReminderForInvoice } from "./send";

export type { ReminderExecutionSummary } from "./executeReminderRun";
export { executeEligibleReminderCandidates } from "./executeReminderRun";
export type { SendReminderForInvoiceFn } from "./executeReminderRun";

export interface ReminderRunResult {
  workspaceId: string;
  candidatesEligible: number;
  invoicesProcessed: number;
  remindersSent: number;
  remindersFailed: number;
  remindersSkipped: number;
  errors: Array<{ invoiceId: string; ruleId?: string; error: string }>;
}

export type RunDueRemindersOptions = {
  evaluationInstant?: Date;
};

/**
 * Run due reminders for a single workspace using canonical eligibility.
 */
export async function runDueRemindersForWorkspace(
  workspaceId: string,
  options: RunDueRemindersOptions = {}
): Promise<ReminderRunResult> {
  const evaluationInstant = options.evaluationInstant ?? new Date();

  const result: ReminderRunResult = {
    workspaceId,
    candidatesEligible: 0,
    invoicesProcessed: 0,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
    errors: [],
  };

  try {
    const supabase = await supabaseServer();

    const { data: emailSettings } = await supabase
      .from("workspace_email_settings")
      .select("id")
      .eq("workspace_id", workspaceId)
      .single();

    if (!emailSettings) {
      console.log(
        `[runDueRemindersForWorkspace] Skipping workspace ${workspaceId}: no email settings`
      );
      return result;
    }

    const candidates = await getEligibleReminders(workspaceId, {
      evaluationInstant,
    });

    if (candidates.length === 0) {
      console.log(
        `[runDueRemindersForWorkspace] No eligible reminder occurrences for workspace ${workspaceId}`
      );
      return result;
    }

    console.log(
      `[runDueRemindersForWorkspace] Processing ${candidates.length} eligible occurrence(s) for workspace ${workspaceId}`
    );

    const execution = await executeEligibleReminderCandidates(
      workspaceId,
      candidates,
      async (opts) => sendReminderForInvoice(opts)
    );

    return {
      workspaceId,
      ...execution,
    };
  } catch (err) {
    console.error(
      `[runDueRemindersForWorkspace] Unexpected error for workspace ${workspaceId}:`,
      err
    );
    result.errors.push({
      invoiceId: "workspace",
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }
}

/**
 * Run due reminders for all active workspaces.
 */
export async function runDueRemindersForAllWorkspaces(
  today: Date = new Date()
): Promise<{
  workspacesProcessed: number;
  totalInvoicesProcessed: number;
  totalRemindersSent: number;
  totalRemindersFailed: number;
  workspaceResults: ReminderRunResult[];
  errors: Array<{ workspaceId: string; error: string }>;
}> {
  const supabase = await supabaseServer();
  const workspaceResults: ReminderRunResult[] = [];
  const errors: Array<{ workspaceId: string; error: string }> = [];

  try {
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at", { ascending: true });

    if (workspacesError) {
      console.error(
        "[runDueRemindersForAllWorkspaces] Error loading workspaces:",
        workspacesError
      );
      errors.push({
        workspaceId: "all",
        error: `Failed to load workspaces: ${workspacesError.message}`,
      });
      return {
        workspacesProcessed: 0,
        totalInvoicesProcessed: 0,
        totalRemindersSent: 0,
        totalRemindersFailed: 0,
        workspaceResults: [],
        errors,
      };
    }

    if (!workspaces || workspaces.length === 0) {
      console.log("[runDueRemindersForAllWorkspaces] No workspaces found");
      return {
        workspacesProcessed: 0,
        totalInvoicesProcessed: 0,
        totalRemindersSent: 0,
        totalRemindersFailed: 0,
        workspaceResults: [],
        errors: [],
      };
    }

    console.log(
      `[runDueRemindersForAllWorkspaces] Processing ${workspaces.length} workspaces`
    );

    for (const workspace of workspaces) {
      try {
        const workspaceResult = await runDueRemindersForWorkspace(workspace.id, {
          evaluationInstant: today,
        });
        workspaceResults.push(workspaceResult);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push({
          workspaceId: workspace.id,
          error: errorMessage,
        });
        console.error(
          `[runDueRemindersForAllWorkspaces] Error processing workspace ${workspace.id}:`,
          err
        );
      }
    }

    const totalInvoicesProcessed = workspaceResults.reduce(
      (sum, r) => sum + r.candidatesEligible,
      0
    );
    const totalRemindersSent = workspaceResults.reduce(
      (sum, r) => sum + r.remindersSent,
      0
    );
    const totalRemindersFailed = workspaceResults.reduce(
      (sum, r) => sum + r.remindersFailed,
      0
    );

    return {
      workspacesProcessed: workspaces.length,
      totalInvoicesProcessed,
      totalRemindersSent,
      totalRemindersFailed,
      workspaceResults,
      errors,
    };
  } catch (err) {
    console.error("[runDueRemindersForAllWorkspaces] Unexpected error:", err);
    errors.push({
      workspaceId: "all",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      workspacesProcessed: 0,
      totalInvoicesProcessed: 0,
      totalRemindersSent: 0,
      totalRemindersFailed: 0,
      workspaceResults: [],
      errors,
    };
  }
}
