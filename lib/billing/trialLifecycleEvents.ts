import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const TRIAL_LIFECYCLE_EVENT_KEYS = [
  "trial_started",
  "trial_7_days_remaining",
  "trial_3_days_remaining",
  "trial_1_day_remaining",
  "trial_expired",
  "trial_expired_plus_3_days",
  "trial_expired_plus_7_days",
] as const;

export type TrialLifecycleEventKey = (typeof TRIAL_LIFECYCLE_EVENT_KEYS)[number];

export type TrialLifecycleEventStatus = "pending" | "sent" | "failed";

export type TrialLifecycleEventMetadata = {
  status: TrialLifecycleEventStatus;
  attemptCount?: number;
  lastAttemptAt?: string;
  sentAt?: string;
  messageId?: string;
  recipientEmail?: string;
  error?: string;
  skippedReason?: string;
};

export type TrialLifecycleEventRow = {
  id: string;
  workspace_id: string;
  event_key: TrialLifecycleEventKey;
  sent_at: string;
  metadata: TrialLifecycleEventMetadata | null;
};

/** If a pending reservation is older than this, another worker may retry. */
export const TRIAL_LIFECYCLE_PENDING_STALE_MS = 30 * 60 * 1000;

type LifecycleEventsAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || Boolean(error.message?.includes("does not exist"));
}

function parseMetadata(raw: unknown): TrialLifecycleEventMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const status = (raw as TrialLifecycleEventMetadata).status;
  if (status === "pending" || status === "sent" || status === "failed") {
    return raw as TrialLifecycleEventMetadata;
  }
  return null;
}

function buildPendingMetadata(attemptCount: number): TrialLifecycleEventMetadata {
  return {
    status: "pending",
    attemptCount,
    lastAttemptAt: new Date().toISOString(),
  };
}

export async function loadTrialLifecycleEvent(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  admin: LifecycleEventsAdmin = supabaseAdmin()
): Promise<TrialLifecycleEventRow | null> {
  const { data, error } = await admin
    .from("workspace_trial_lifecycle_events")
    .select("id, workspace_id, event_key, sent_at, metadata")
    .eq("workspace_id", workspaceId)
    .eq("event_key", eventKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw new Error(`Failed to load trial lifecycle event: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return data as TrialLifecycleEventRow;
}

function isPendingStale(metadata: TrialLifecycleEventMetadata, nowMs: number): boolean {
  if (metadata.status !== "pending") {
    return false;
  }
  const lastAttemptAt = metadata.lastAttemptAt ? Date.parse(metadata.lastAttemptAt) : NaN;
  if (Number.isNaN(lastAttemptAt)) {
    return true;
  }
  return nowMs - lastAttemptAt >= TRIAL_LIFECYCLE_PENDING_STALE_MS;
}

export type AcquireTrialLifecycleSendSlotResult =
  | { acquired: true; rowId: string; attemptCount: number }
  | {
      acquired: false;
      reason: "already_sent" | "in_progress" | "missing_table" | "reservation_failed";
    };

/**
 * Reserves a send slot without marking the email as successfully delivered.
 * Uses metadata.status on the existing row — no migration required.
 */
export async function acquireTrialLifecycleSendSlot(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<AcquireTrialLifecycleSendSlotResult> {
  const nowMs = now.getTime();
  const pendingMetadata = buildPendingMetadata(1);

  const { data: inserted, error: insertError } = await admin
    .from("workspace_trial_lifecycle_events")
    .insert({
      workspace_id: workspaceId,
      event_key: eventKey,
      metadata: pendingMetadata,
    })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted?.id) {
    return { acquired: true, rowId: inserted.id, attemptCount: 1 };
  }

  if (insertError) {
    if (isMissingTableError(insertError)) {
      return { acquired: false, reason: "missing_table" };
    }
    if (insertError.code !== "23505") {
      throw new Error(`Failed to reserve trial lifecycle event: ${insertError.message}`);
    }
  }

  const existing = await loadTrialLifecycleEvent(workspaceId, eventKey, admin);
  if (!existing) {
    return { acquired: false, reason: "reservation_failed" };
  }

  const metadata = parseMetadata(existing.metadata);
  if (metadata?.status === "sent") {
    return { acquired: false, reason: "already_sent" };
  }

  const canRetry =
    metadata?.status === "failed" ||
    (metadata?.status === "pending" && isPendingStale(metadata, nowMs)) ||
    metadata == null;

  if (!canRetry) {
    return { acquired: false, reason: "in_progress" };
  }

  const attemptCount = (metadata?.attemptCount ?? 0) + 1;
  const nextMetadata = buildPendingMetadata(attemptCount);

  let reclaimQuery = admin
    .from("workspace_trial_lifecycle_events")
    .update({ metadata: nextMetadata, sent_at: now.toISOString() })
    .eq("id", existing.id);

  if (metadata?.status === "failed") {
    reclaimQuery = reclaimQuery.filter("metadata->>status", "eq", "failed");
  } else if (metadata?.status === "pending") {
    reclaimQuery = reclaimQuery
      .filter("metadata->>status", "eq", "pending")
      .filter(
        "metadata->>lastAttemptAt",
        "eq",
        metadata.lastAttemptAt ?? "__missing_last_attempt__"
      );
  } else if (metadata == null) {
    reclaimQuery = reclaimQuery.is("metadata", null);
  } else {
    return { acquired: false, reason: "reservation_failed" };
  }

  const { data: updated, error: updateError } = await reclaimQuery.select("id").maybeSingle();

  if (updateError) {
    throw new Error(`Failed to renew trial lifecycle reservation: ${updateError.message}`);
  }

  if (!updated?.id) {
    return { acquired: false, reason: "reservation_failed" };
  }

  return { acquired: true, rowId: updated.id, attemptCount };
}

export async function markTrialLifecycleEventSent(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  details: {
    messageId?: string;
    recipientEmail: string;
    attemptCount?: number;
  },
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: TrialLifecycleEventMetadata = {
    status: "sent",
    attemptCount: details.attemptCount,
    lastAttemptAt: now.toISOString(),
    sentAt: now.toISOString(),
    messageId: details.messageId,
    recipientEmail: details.recipientEmail,
  };

  const { error } = await admin
    .from("workspace_trial_lifecycle_events")
    .update({ metadata, sent_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("event_key", eventKey);

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to mark trial lifecycle event sent: ${error.message}`);
  }
}

export async function markTrialLifecycleEventFailed(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  errorMessage: string,
  attemptCount?: number,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: TrialLifecycleEventMetadata = {
    status: "failed",
    attemptCount,
    lastAttemptAt: now.toISOString(),
    error: errorMessage,
  };

  const { error } = await admin
    .from("workspace_trial_lifecycle_events")
    .update({ metadata, sent_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("event_key", eventKey);

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to mark trial lifecycle event failed: ${error.message}`);
  }
}

export async function markTrialLifecycleEventSkipped(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  skippedReason: string,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: TrialLifecycleEventMetadata = {
    status: "sent",
    sentAt: now.toISOString(),
    skippedReason,
  };

  const { error } = await admin
    .from("workspace_trial_lifecycle_events")
    .upsert(
      {
        workspace_id: workspaceId,
        event_key: eventKey,
        metadata,
        sent_at: now.toISOString(),
      },
      { onConflict: "workspace_id,event_key", ignoreDuplicates: false }
    );

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to record skipped trial lifecycle event: ${error.message}`);
  }
}

/** @deprecated Prefer acquireTrialLifecycleSendSlot + markTrialLifecycleEventSent. */
export async function recordTrialLifecycleEvent(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  metadata: Record<string, unknown> = {}
): Promise<{ recorded: boolean }> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("workspace_trial_lifecycle_events").insert({
    workspace_id: workspaceId,
    event_key: eventKey,
    metadata: {
      status: "sent",
      ...metadata,
    },
  });

  if (error) {
    if (error.code === "23505") {
      return { recorded: false };
    }
    if (isMissingTableError(error)) {
      return { recorded: false };
    }
    throw new Error(`Failed to record trial lifecycle event: ${error.message}`);
  }

  return { recorded: true };
}
