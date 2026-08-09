import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const TRIAL_LIFECYCLE_EVENT_KEYS = [
  "trial_started",
  "trial_3_days_remaining",
  "trial_1_day_remaining",
  "trial_expired",
  "trial_expired_plus_3_days",
  "trial_expired_plus_7_days",
] as const;

export type TrialLifecycleEventKey = (typeof TRIAL_LIFECYCLE_EVENT_KEYS)[number];

export async function recordTrialLifecycleEvent(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  metadata: Record<string, unknown> = {}
): Promise<{ recorded: boolean }> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("workspace_trial_lifecycle_events").insert({
    workspace_id: workspaceId,
    event_key: eventKey,
    metadata,
  });

  if (error) {
    if (error.code === "23505") {
      return { recorded: false };
    }
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { recorded: false };
    }
    throw new Error(`Failed to record trial lifecycle event: ${error.message}`);
  }

  return { recorded: true };
}

/** Delivery wiring deferred until transactional email cron is connected. */
export async function scheduleTrialLifecycleEvents(_workspaceId: string): Promise<void> {
  return;
}
