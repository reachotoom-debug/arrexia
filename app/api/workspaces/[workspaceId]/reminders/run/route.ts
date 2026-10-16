/**
 * Workspace-level reminder runner endpoint
 * 
 * POST /api/workspaces/[workspaceId]/reminders/run
 * 
 * Allows manual triggering of reminders for a specific workspace
 * Useful for debugging and testing
 * 
 * Protected by workspace authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceForApi } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runDueRemindersForWorkspace } from "@/lib/reminders/run-reminders";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId: requestedWorkspaceId } = await params;
    const access = await requireWorkspaceForApi(requestedWorkspaceId);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }
    const workspaceId = access.workspace.id;

    console.log(`[WorkspaceReminderRunnerAPI] Manual trigger for workspace ${workspaceId} at`, new Date().toISOString());
    const startTime = Date.now();

    // Automatic occurrence claims require service-role credentials. Create them
    // only after workspace access is verified and retain the verified scope.
    const result = await runDueRemindersForWorkspace(workspaceId, {
      supabase: supabaseAdmin(),
    });

    const duration = Date.now() - startTime;
    console.log(
      `[WorkspaceReminderRunnerAPI] Reminder run completed for workspace ${workspaceId} in ${duration}ms. ` +
      `Sent ${result.remindersSent} reminders, failed ${result.remindersFailed}`
    );

    const hasFailures = result.remindersFailed > 0 || result.errors.length > 0 || result.remindersUncertain > 0;
    const hasWarnings = result.warnings.length > 0;
    const reconciliationRequired = hasWarnings || result.remindersUncertain > 0;
    const status = hasFailures
      ? result.remindersSent > 0 ? "partial" : "failed"
      : hasWarnings ? "partial"
      : result.remindersSent === 0 ? "skipped" : "success";

    return NextResponse.json({
      success: status === "success" || status === "skipped",
      status,
      reconciliationRequired,
      retryAllowed: false,
      message: reconciliationRequired
        ? "Review and reconcile delivery records before any further send attempt. Do not replay this batch."
        : undefined,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      workspaceId: result.workspaceId,
      automationSkipReason: result.automationSkipReason ?? null,
      emailSkipReason: result.emailSkipReason ?? null,
      entitlementSkipReason: result.entitlementSkipReason ?? null,
      candidatesEligible: result.candidatesEligible,
      invoicesProcessed: result.invoicesProcessed,
      remindersSent: result.remindersSent,
      remindersFailed: result.remindersFailed,
      remindersSkipped: result.remindersSkipped,
      remindersUncertain: result.remindersUncertain,
      warnings: result.warnings,
      errors: result.errors,
    }, { status: status === "failed" ? 500 : 200 });
  } catch (err) {
    console.error("[WorkspaceReminderRunnerAPI] Unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}
