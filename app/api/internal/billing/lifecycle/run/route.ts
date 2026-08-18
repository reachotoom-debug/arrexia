/**
 * Internal API endpoint for workspace trial lifecycle email processing.
 *
 * GET /api/internal/billing/lifecycle/run  — Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST /api/internal/billing/lifecycle/run — legacy/manual trigger (Bearer or x-cron-secret)
 */

import { NextRequest, NextResponse } from "next/server";
import { runTrialLifecycleEmailsForAllWorkspaces } from "@/lib/billing/runTrialLifecycleEmails";
import { verifyCronReminderAuth } from "@/lib/reminders/cronAuth";

async function handleLifecycleRun() {
  console.log(
    "[TrialLifecycleCron] Starting lifecycle run at",
    new Date().toISOString()
  );
  const startTime = Date.now();

  const result = await runTrialLifecycleEmailsForAllWorkspaces();

  const duration = Date.now() - startTime;
  console.log(
    `[TrialLifecycleCron] Completed in ${duration}ms. ` +
      `Processed ${result.workspacesProcessed} workspaces, ` +
      `sent ${result.totalSent}, skipped ${result.totalSkipped}, failed ${result.totalFailed}`
  );

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    durationMs: duration,
    summary: {
      workspacesProcessed: result.workspacesProcessed,
      totalSent: result.totalSent,
      totalSkipped: result.totalSkipped,
      totalFailed: result.totalFailed,
      errorsCount: result.errors.length,
    },
    workspaceResults: result.workspaceResults,
    errors: result.errors,
  });
}

function unauthorizedResponse(
  auth: Extract<ReturnType<typeof verifyCronReminderAuth>, { ok: false }>
) {
  if (auth.status === 500) {
    console.error("[TrialLifecycleCron] CRON_SECRET environment variable is not set");
  } else {
    console.warn("[TrialLifecycleCron] Unauthorized access attempt");
  }
  return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
}

export async function GET(req: NextRequest) {
  try {
    const auth = verifyCronReminderAuth(req.headers);
    if (!auth.ok) {
      return unauthorizedResponse(auth);
    }
    return await handleLifecycleRun();
  } catch (err) {
    console.error("[TrialLifecycleCron] Unexpected error:", err);
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
    return await handleLifecycleRun();
  } catch (err) {
    console.error("[TrialLifecycleCron] Unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}
