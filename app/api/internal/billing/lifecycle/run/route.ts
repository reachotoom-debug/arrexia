/**
 * Internal API endpoint for paid and trial billing lifecycle email processing.
 *
 * GET /api/internal/billing/lifecycle/run  — Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST /api/internal/billing/lifecycle/run — legacy/manual trigger (Bearer or x-cron-secret)
 */

import { NextRequest, NextResponse } from "next/server";
import { runTrialLifecycleEmailsForAllWorkspaces } from "@/lib/billing/runTrialLifecycleEmails";
import { verifyCronReminderAuth } from "@/lib/reminders/cronAuth";
import { enqueueAnnualBillingReminders, runPaidBillingEmailRecovery } from "@/lib/billing/billingEmailDelivery";

async function handleLifecycleRun() {
  console.log(
    "[TrialLifecycleCron] Starting lifecycle run at",
    new Date().toISOString()
  );
  const startTime = Date.now();

  const stageFailures: string[] = [];
  // Independent paid stages run first so trial failures cannot strand paid intent.
  const annualRemindersQueued = await enqueueAnnualBillingReminders().catch(() => {
    stageFailures.push("annual_reminder_enqueue"); return 0;
  });
  const paidEmailRecovery = await runPaidBillingEmailRecovery().catch(() => {
    stageFailures.push("paid_email_recovery"); return null;
  });
  const result = await runTrialLifecycleEmailsForAllWorkspaces().catch(() => {
    stageFailures.push("trial_lifecycle"); return null;
  });

  const duration = Date.now() - startTime;
  console.log(
    `[TrialLifecycleCron] Completed in ${duration}ms. ` +
      `Processed ${result?.workspacesProcessed ?? 0} trial workspaces, ` +
      `sent ${result?.totalSent ?? 0}, stage failures ${stageFailures.length}`
  );

  return NextResponse.json({
    success: stageFailures.length === 0,
    timestamp: new Date().toISOString(),
    durationMs: duration,
    summary: {
      workspacesProcessed: result?.workspacesProcessed ?? 0,
      totalSent: result?.totalSent ?? 0,
      totalSkipped: result?.totalSkipped ?? 0,
      totalFailed: result?.totalFailed ?? 0,
      errorsCount: result?.errors.length ?? 0,
    },
    workspaceResults: result?.workspaceResults ?? [],
    errors: result?.errors ?? [],
    stageFailures,
    annualRemindersQueued,
    paidEmailRecovery,
  }, { status: stageFailures.length ? 500 : 200 });
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
