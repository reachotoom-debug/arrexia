/**
 * Internal API endpoint for automated reminder runner
 * 
 * POST /api/internal/reminders/run
 * 
 * This endpoint is intended to be called by a scheduler (Vercel Cron, Supabase Edge Function, etc.)
 * 
 * Security: Protected by x-cron-secret header matching CRON_SECRET environment variable
 * 
 * Returns summary of reminder run results
 */

import { NextRequest, NextResponse } from "next/server";
import { runDueRemindersForAllWorkspaces } from "@/lib/reminders/run-reminders";

export async function POST(req: NextRequest) {
  try {
    // Security check: verify cron secret
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("x-cron-secret");

    if (!secret) {
      console.error("[ReminderRunnerAPI] CRON_SECRET environment variable is not set");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (header !== secret) {
      console.warn("[ReminderRunnerAPI] Unauthorized access attempt");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Run reminders for all workspaces
    console.log("[ReminderRunnerAPI] Starting reminder run at", new Date().toISOString());
    const startTime = Date.now();

    const result = await runDueRemindersForAllWorkspaces();

    const duration = Date.now() - startTime;
    console.log(
      `[ReminderRunnerAPI] Reminder run completed in ${duration}ms. ` +
      `Processed ${result.workspacesProcessed} workspaces, ` +
      `sent ${result.totalRemindersSent} reminders, ` +
      `failed ${result.totalRemindersFailed}`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      summary: {
        workspacesProcessed: result.workspacesProcessed,
        totalInvoicesProcessed: result.totalInvoicesProcessed,
        totalRemindersSent: result.totalRemindersSent,
        totalRemindersFailed: result.totalRemindersFailed,
        errorsCount: result.errors.length,
      },
      // Include detailed results for debugging (can be removed in production if too verbose)
      workspaceResults: result.workspaceResults,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[ReminderRunnerAPI] Unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}
