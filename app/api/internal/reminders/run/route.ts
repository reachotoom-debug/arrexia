/**
 * Internal API endpoint for automated reminder runner
 *
 * GET /api/internal/reminders/run  — Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST /api/internal/reminders/run — legacy/manual trigger (Bearer or x-cron-secret)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronReminderAuth } from "@/lib/reminders/cronAuth";
import { runDueRemindersForAllWorkspaces } from "@/lib/reminders/run-reminders";

async function handleCronRun() {
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

  const workspaceErrors = result.workspaceResults.flatMap(workspace => workspace.errors.map(error => ({ workspaceId: workspace.workspaceId, ...error })));
  const warningsCount = result.workspaceResults.reduce((sum, workspace) => sum + workspace.warnings.length, 0);
  const errors = [...result.errors, ...workspaceErrors];
  const reconciliationRequired = warningsCount > 0 || result.totalRemindersUncertain > 0;
  const hasIssues = result.totalRemindersFailed > 0 || errors.length > 0 || reconciliationRequired;
  const status = hasIssues ? (result.totalRemindersSent > 0 ? "partial" : "failed") : "success";
  return NextResponse.json({
    success: !hasIssues,
    status,
    reconciliationRequired,
    retryAllowed: false,
    ...(reconciliationRequired ? { message: "Reconcile delivery and history before any further action; do not resend or replay this batch." } : {}),
    timestamp: new Date().toISOString(),
    durationMs: duration,
    summary: {
      workspacesProcessed: result.workspacesProcessed,
      totalInvoicesProcessed: result.totalInvoicesProcessed,
      totalRemindersSent: result.totalRemindersSent,
      totalRemindersFailed: result.totalRemindersFailed,
      totalRemindersUncertain: result.totalRemindersUncertain,
      warningsCount,
      errorsCount: errors.length,
    },
    workspaceResults: result.workspaceResults,
    errors,
  }, { status: status === "failed" ? 500 : 200 });
}

function unauthorizedResponse(auth: Extract<ReturnType<typeof verifyCronReminderAuth>, { ok: false }>) {
  if (auth.status === 500) {
    console.error("[ReminderRunnerAPI] CRON_SECRET environment variable is not set");
  } else {
    console.warn("[ReminderRunnerAPI] Unauthorized access attempt");
  }
  return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
}

export async function GET(req: NextRequest) {
  try {
    const auth = verifyCronReminderAuth(req.headers);
    if (!auth.ok) {
      return unauthorizedResponse(auth);
    }
    return await handleCronRun();
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

export async function POST(req: NextRequest) {
  try {
    const auth = verifyCronReminderAuth(req.headers);
    if (!auth.ok) {
      return unauthorizedResponse(auth);
    }
    return await handleCronRun();
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
