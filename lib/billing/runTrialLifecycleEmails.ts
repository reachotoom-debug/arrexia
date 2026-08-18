import "server-only";

import { getWorkspaceEntitlementState } from "@/lib/billing/getWorkspaceEntitlement";
import { getWorkspaceOwnerEmailsByWorkspaceId } from "@/lib/billing/getWorkspaceOwnerEmail";
import { deliverTrialLifecycleEmail } from "@/lib/billing/trialLifecycleDelivery";
import { getEligibleTrialLifecycleEvents, selectTrialLifecycleEventForRun } from "@/lib/billing/trialLifecycleEligibility";
import type { TrialLifecycleEventKey } from "@/lib/billing/trialLifecycleEvents";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TrialLifecycleWorkspaceResult = {
  workspaceId: string;
  eventsAttempted: TrialLifecycleEventKey[];
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  details: Array<{
    eventKey: TrialLifecycleEventKey;
    outcome: "sent" | "skipped" | "failed";
    reason?: string;
  }>;
};

export type RunTrialLifecycleEmailsResult = {
  workspacesProcessed: number;
  totalSent: number;
  totalSkipped: number;
  totalFailed: number;
  workspaceResults: TrialLifecycleWorkspaceResult[];
  errors: string[];
};

type SubscriptionRow = {
  workspace_id: string;
  trial_ends_at: string | null;
};

export async function runTrialLifecycleEmailsForAllWorkspaces(
  now: Date = new Date()
): Promise<RunTrialLifecycleEmailsResult> {
  const admin = supabaseAdmin();
  const { data: subscriptions, error } = await admin
    .from("workspace_subscriptions")
    .select("workspace_id, trial_ends_at")
    .not("trial_ends_at", "is", null);

  if (error) {
    throw new Error(`Failed to load trial subscriptions: ${error.message}`);
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];
  const workspaceResults: TrialLifecycleWorkspaceResult[] = [];
  const errors: string[] = [];
  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const ownerEmails = await getWorkspaceOwnerEmailsByWorkspaceId(
    rows.map((row) => row.workspace_id)
  );

  for (const row of rows) {
    const workspaceId = row.workspace_id;
    const result: TrialLifecycleWorkspaceResult = {
      workspaceId,
      eventsAttempted: [],
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
    };

    try {
      const entitlement = await getWorkspaceEntitlementState(workspaceId, now);
      if (entitlement.state === "paid") {
        workspaceResults.push(result);
        continue;
      }

      const eligibleEvents = getEligibleTrialLifecycleEvents(
        entitlement,
        row.trial_ends_at,
        now
      );
      const eventKey = selectTrialLifecycleEventForRun(eligibleEvents);
      if (!eventKey) {
        workspaceResults.push(result);
        continue;
      }

      result.eventsAttempted.push(eventKey);

      const owner = ownerEmails.get(workspaceId);
      const delivery = await deliverTrialLifecycleEmail(
        workspaceId,
        eventKey,
        {
          resolveOwnerFn: owner
            ? async () => ({ ok: true as const, owner })
            : undefined,
        },
        now
      );

      if (!delivery.ok) {
        result.failedCount += 1;
        totalFailed += 1;
        result.details.push({
          eventKey,
          outcome: "failed",
          reason: delivery.error,
        });
      } else if (delivery.sent) {
        result.sentCount += 1;
        totalSent += 1;
        result.details.push({ eventKey, outcome: "sent" });
      } else {
        result.skippedCount += 1;
        totalSkipped += 1;
        result.details.push({
          eventKey,
          outcome: "skipped",
          reason: delivery.reason,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown lifecycle error";
      errors.push(`${workspaceId}: ${message}`);
    }

    workspaceResults.push(result);
  }

  return {
    workspacesProcessed: rows.length,
    totalSent,
    totalSkipped,
    totalFailed,
    workspaceResults,
    errors,
  };
}
