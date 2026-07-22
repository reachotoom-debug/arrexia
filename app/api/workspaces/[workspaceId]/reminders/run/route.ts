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
import { requireWorkspace } from "@/lib/auth/server";
import { runDueRemindersForWorkspace } from "@/lib/reminders/run-reminders";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requireWorkspace(workspaceId);

    console.log(`[WorkspaceReminderRunnerAPI] Manual trigger for workspace ${workspaceId} at`, new Date().toISOString());
    const startTime = Date.now();

    const result = await runDueRemindersForWorkspace(workspaceId);

    const duration = Date.now() - startTime;
    console.log(
      `[WorkspaceReminderRunnerAPI] Reminder run completed for workspace ${workspaceId} in ${duration}ms. ` +
      `Sent ${result.remindersSent} reminders, failed ${result.remindersFailed}`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      workspaceId: result.workspaceId,
      candidatesEligible: result.candidatesEligible,
      invoicesProcessed: result.invoicesProcessed,
      remindersSent: result.remindersSent,
      remindersFailed: result.remindersFailed,
      remindersSkipped: result.remindersSkipped,
      errors: result.errors,
    });
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
