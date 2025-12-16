/**
 * Automated reminder runner
 * Finds invoices that should receive reminders based on reminder_rules
 * and sends them using the shared sendReminderForInvoice helper
 */

import { supabaseServer } from "@/lib/supabase/server";
import { findApplicableRuleForInvoice } from "./engine";
import { sendReminderForInvoice, type SendReminderResult } from "./send";

export interface ReminderRunResult {
  workspaceId: string;
  invoicesProcessed: number;
  remindersSent: number;
  remindersFailed: number;
  errors: Array<{ invoiceId: string; error: string }>;
}

/**
 * Run due reminders for a single workspace
 * 
 * Finds invoices that match reminder rules and sends reminders
 * Prevents duplicates by checking existing reminder logs
 */
export async function runDueRemindersForWorkspace(
  workspaceId: string,
  today: Date = new Date()
): Promise<ReminderRunResult> {
  const supabase = await supabaseServer();
  const result: ReminderRunResult = {
    workspaceId,
    invoicesProcessed: 0,
    remindersSent: 0,
    remindersFailed: 0,
    errors: [],
  };

  try {
    // 1) Check if workspace has email settings configured
    const { data: emailSettings } = await supabase
      .from("workspace_email_settings")
      .select("id")
      .eq("workspace_id", workspaceId)
      .single();

    if (!emailSettings) {
      console.log(`[runDueRemindersForWorkspace] Skipping workspace ${workspaceId}: no email settings`);
      return result;
    }

    // 2) Check if workspace has any enabled reminder rules
    const { data: enabledRules } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_enabled", true)
      .limit(1);

    if (!enabledRules || enabledRules.length === 0) {
      console.log(`[runDueRemindersForWorkspace] Skipping workspace ${workspaceId}: no enabled rules`);
      return result;
    }

    // 3) Load candidate invoices from invoices_view
    // Criteria:
    // - Not fully paid (outstanding > 0)
    // - Not void (display_status != 'void')
    // - Has due_date (required for timing calculations)
    // - Status is sent, partially_paid, or overdue
    const { data: candidateInvoices, error: invoicesError } = await supabase
      .from("invoices_view")
      .select(`
        id,
        workspace_id,
        client_id,
        invoice_number,
        due_date,
        outstanding,
        display_status,
        base_status
      `)
      .eq("workspace_id", workspaceId)
      .gt("outstanding", 0)
      .not("due_date", "is", null)
      .in("display_status", ["sent", "partially_paid", "overdue"]);

    if (invoicesError) {
      console.error(`[runDueRemindersForWorkspace] Error loading invoices for workspace ${workspaceId}:`, invoicesError);
      result.errors.push({
        invoiceId: "all",
        error: `Failed to load invoices: ${invoicesError.message}`,
      });
      return result;
    }

    if (!candidateInvoices || candidateInvoices.length === 0) {
      console.log(`[runDueRemindersForWorkspace] No candidate invoices for workspace ${workspaceId}`);
      return result;
    }

    console.log(`[runDueRemindersForWorkspace] Processing ${candidateInvoices.length} candidate invoices for workspace ${workspaceId}`);

    // 4) For each invoice, find applicable rule and send reminder
    for (const invoice of candidateInvoices) {
      result.invoicesProcessed++;

      try {
        // Find applicable rule (this already checks for duplicates within the same day)
        const match = await findApplicableRuleForInvoice(
          supabase,
          workspaceId,
          {
            id: invoice.id,
            due_date: invoice.due_date,
            outstanding_amount: Number(invoice.outstanding ?? 0),
            status: invoice.display_status ?? invoice.base_status,
          },
          today
        );

        if (!match) {
          // No applicable rule for this invoice today
          continue;
        }

        // Send reminder
        const sendResult: SendReminderResult = await sendReminderForInvoice({
          workspaceId,
          invoiceId: invoice.id,
          ruleId: match.rule.id,
          templateId: match.template.id,
          source: "auto_cron",
          userId: null, // Automated sends have no user
        });

        if (sendResult.success) {
          result.remindersSent++;
          console.log(`[runDueRemindersForWorkspace] Sent reminder for invoice ${invoice.invoice_number} (${invoice.id})`);
        } else {
          result.remindersFailed++;
          result.errors.push({
            invoiceId: invoice.id,
            error: sendResult.errorMessage || "Unknown error",
          });
          console.error(
            `[runDueRemindersForWorkspace] Failed to send reminder for invoice ${invoice.invoice_number} (${invoice.id}):`,
            sendResult.errorMessage
          );
        }
      } catch (err) {
        result.remindersFailed++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.errors.push({
          invoiceId: invoice.id,
          error: errorMessage,
        });
        console.error(
          `[runDueRemindersForWorkspace] Error processing invoice ${invoice.invoice_number} (${invoice.id}):`,
          err
        );
      }
    }
  } catch (err) {
    console.error(`[runDueRemindersForWorkspace] Unexpected error for workspace ${workspaceId}:`, err);
    result.errors.push({
      invoiceId: "workspace",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Run due reminders for all active workspaces
 * 
 * Finds all workspaces and processes reminders for each
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
    // Load all workspaces
    // TODO: In the future, add a field like "reminders_enabled" to filter workspaces
    // For now, we process all workspaces and skip those without email settings/rules
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at", { ascending: true });

    if (workspacesError) {
      console.error("[runDueRemindersForAllWorkspaces] Error loading workspaces:", workspacesError);
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

    console.log(`[runDueRemindersForAllWorkspaces] Processing ${workspaces.length} workspaces`);

    // Process each workspace
    for (const workspace of workspaces) {
      try {
        const workspaceResult = await runDueRemindersForWorkspace(workspace.id, today);
        workspaceResults.push(workspaceResult);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push({
          workspaceId: workspace.id,
          error: errorMessage,
        });
        console.error(`[runDueRemindersForAllWorkspaces] Error processing workspace ${workspace.id}:`, err);
      }
    }

    // Aggregate results
    const totalInvoicesProcessed = workspaceResults.reduce((sum, r) => sum + r.invoicesProcessed, 0);
    const totalRemindersSent = workspaceResults.reduce((sum, r) => sum + r.remindersSent, 0);
    const totalRemindersFailed = workspaceResults.reduce((sum, r) => sum + r.remindersFailed, 0);

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
