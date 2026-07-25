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
    workspaceResults: result.workspaceResults,
    errors: result.errors,
  });
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
