import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const PAID_LIFECYCLE_EVENT_KEYS = ["paid_subscription_activated"] as const;

export type PaidLifecycleEventKey = (typeof PAID_LIFECYCLE_EVENT_KEYS)[number];

export type PaidLifecycleEventStatus = "pending" | "sent" | "failed";

export type PaidLifecycleEventMetadata = {
  status: PaidLifecycleEventStatus;
  attemptCount?: number;
  lastAttemptAt?: string;
  sentAt?: string;
  messageId?: string;
  recipientEmail?: string;
  error?: string;
  skippedReason?: string;
};

export type PaidLifecycleEventRow = {
  id: string;
  workspace_id: string;
  provider_subscription_id: string;
  event_key: PaidLifecycleEventKey;
  sent_at: string;
  metadata: PaidLifecycleEventMetadata | null;
};

/** If a pending reservation is older than this, another worker may retry. */
export const PAID_LIFECYCLE_PENDING_STALE_MS = 30 * 60 * 1000;

type LifecycleEventsAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || Boolean(error.message?.includes("does not exist"));
}

function parseMetadata(raw: unknown): PaidLifecycleEventMetadata | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const status = (raw as PaidLifecycleEventMetadata).status;
  if (status === "pending" || status === "sent" || status === "failed") {
    return raw as PaidLifecycleEventMetadata;
  }
  return null;
}

function buildPendingMetadata(attemptCount: number): PaidLifecycleEventMetadata {
  return {
    status: "pending",
    attemptCount,
    lastAttemptAt: new Date().toISOString(),
  };
}

export async function loadPaidLifecycleEvent(
  providerSubscriptionId: string,
  eventKey: PaidLifecycleEventKey,
  admin: LifecycleEventsAdmin = supabaseAdmin()
): Promise<PaidLifecycleEventRow | null> {
  const { data, error } = await admin
    .from("workspace_paid_lifecycle_events")
    .select("id, workspace_id, provider_subscription_id, event_key, sent_at, metadata")
    .eq("provider_subscription_id", providerSubscriptionId)
    .eq("event_key", eventKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw new Error(`Failed to load paid lifecycle event: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return data as PaidLifecycleEventRow;
}

function isPendingStale(metadata: PaidLifecycleEventMetadata, nowMs: number): boolean {
  if (metadata.status !== "pending") {
    return false;
  }
  const lastAttemptAt = metadata.lastAttemptAt ? Date.parse(metadata.lastAttemptAt) : NaN;
  if (Number.isNaN(lastAttemptAt)) {
    return true;
  }
  return nowMs - lastAttemptAt >= PAID_LIFECYCLE_PENDING_STALE_MS;
}

export type AcquirePaidLifecycleSendSlotResult =
  | { acquired: true; rowId: string; attemptCount: number }
  | {
      acquired: false;
      reason: "already_sent" | "in_progress" | "missing_table" | "reservation_failed";
    };

/**
 * Reserves a send slot without marking the email as successfully delivered.
 * Unique on (provider_subscription_id, event_key) for Paddle retry safety.
 */
export async function acquirePaidLifecycleSendSlot(
  workspaceId: string,
  providerSubscriptionId: string,
  eventKey: PaidLifecycleEventKey,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<AcquirePaidLifecycleSendSlotResult> {
  const nowMs = now.getTime();
  const pendingMetadata = buildPendingMetadata(1);

  const { data: inserted, error: insertError } = await admin
    .from("workspace_paid_lifecycle_events")
    .insert({
      workspace_id: workspaceId,
      provider_subscription_id: providerSubscriptionId,
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
      throw new Error(`Failed to reserve paid lifecycle event: ${insertError.message}`);
    }
  }

  const existing = await loadPaidLifecycleEvent(providerSubscriptionId, eventKey, admin);
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
    .from("workspace_paid_lifecycle_events")
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
    throw new Error(`Failed to renew paid lifecycle reservation: ${updateError.message}`);
  }

  if (!updated?.id) {
    return { acquired: false, reason: "reservation_failed" };
  }

  return { acquired: true, rowId: updated.id, attemptCount };
}

export async function markPaidLifecycleEventSent(
  providerSubscriptionId: string,
  eventKey: PaidLifecycleEventKey,
  details: {
    messageId?: string;
    recipientEmail: string;
    attemptCount?: number;
  },
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: PaidLifecycleEventMetadata = {
    status: "sent",
    attemptCount: details.attemptCount,
    lastAttemptAt: now.toISOString(),
    sentAt: now.toISOString(),
    messageId: details.messageId,
    recipientEmail: details.recipientEmail,
  };

  const { error } = await admin
    .from("workspace_paid_lifecycle_events")
    .update({ metadata, sent_at: now.toISOString() })
    .eq("provider_subscription_id", providerSubscriptionId)
    .eq("event_key", eventKey);

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to mark paid lifecycle event sent: ${error.message}`);
  }
}

export async function markPaidLifecycleEventFailed(
  providerSubscriptionId: string,
  eventKey: PaidLifecycleEventKey,
  errorMessage: string,
  attemptCount?: number,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: PaidLifecycleEventMetadata = {
    status: "failed",
    attemptCount,
    lastAttemptAt: now.toISOString(),
    error: errorMessage,
  };

  const { error } = await admin
    .from("workspace_paid_lifecycle_events")
    .update({ metadata, sent_at: now.toISOString() })
    .eq("provider_subscription_id", providerSubscriptionId)
    .eq("event_key", eventKey);

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to mark paid lifecycle event failed: ${error.message}`);
  }
}

export async function markPaidLifecycleEventSkipped(
  workspaceId: string,
  providerSubscriptionId: string,
  eventKey: PaidLifecycleEventKey,
  skippedReason: string,
  admin: LifecycleEventsAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<void> {
  const metadata: PaidLifecycleEventMetadata = {
    status: "sent",
    sentAt: now.toISOString(),
    skippedReason,
  };

  const { error } = await admin
    .from("workspace_paid_lifecycle_events")
    .upsert(
      {
        workspace_id: workspaceId,
        provider_subscription_id: providerSubscriptionId,
        event_key: eventKey,
        metadata,
        sent_at: now.toISOString(),
      },
      { onConflict: "provider_subscription_id,event_key", ignoreDuplicates: false }
    );

  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to record skipped paid lifecycle event: ${error.message}`);
  }
}
