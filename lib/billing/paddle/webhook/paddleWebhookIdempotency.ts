import "server-only";

import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type PaddleWebhookEventStatus = "processing" | "processed" | "ignored" | "failed";

export type PaddleWebhookIdempotencyBeginResult =
  | { ok: true; state: "new" }
  | { ok: true; state: "duplicate"; status: PaddleWebhookEventStatus; result: string | null }
  | { ok: false; state: "concurrent" | "missing_table"; error: string };

export type PaddleWebhookIdempotencyRecordInput = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  status: PaddleWebhookEventStatus;
  result: string;
  workspaceId?: string | null;
  providerSubscriptionId?: string | null;
};

type IdempotencyAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export async function beginPaddleWebhookProcessing(
  input: Omit<PaddleWebhookIdempotencyRecordInput, "status" | "result">,
  admin: IdempotencyAdmin = supabaseAdmin()
): Promise<PaddleWebhookIdempotencyBeginResult> {
  const { data, error } = await admin
    .from("paddle_webhook_events")
    .insert({
      event_id: input.eventId,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      status: "processing",
      workspace_id: input.workspaceId ?? null,
      provider_subscription_id: input.providerSubscriptionId ?? null,
    })
    .select("event_id")
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return { ok: false, state: "missing_table", error: error.message };
    }

    if (error.code === "23505") {
      const { data: existing, error: readError } = await admin
        .from("paddle_webhook_events")
        .select("status, result")
        .eq("event_id", input.eventId)
        .maybeSingle();

      if (readError) {
        return { ok: false, state: "concurrent", error: readError.message };
      }

      const status = (existing?.status ?? "processing") as PaddleWebhookEventStatus;
      if (status === "processing") {
        return { ok: false, state: "concurrent", error: "Event is already processing." };
      }

      return {
        ok: true,
        state: "duplicate",
        status,
        result: typeof existing?.result === "string" ? existing.result : null,
      };
    }

    return { ok: false, state: "concurrent", error: error.message };
  }

  if (!data) {
    return { ok: false, state: "concurrent", error: "Could not claim webhook event." };
  }

  return { ok: true, state: "new" };
}

export async function finalizePaddleWebhookProcessing(
  input: PaddleWebhookIdempotencyRecordInput,
  admin: IdempotencyAdmin = supabaseAdmin()
): Promise<void> {
  const { error } = await admin
    .from("paddle_webhook_events")
    .update({
      status: input.status,
      result: input.result,
      processed_at: new Date().toISOString(),
      workspace_id: input.workspaceId ?? null,
      provider_subscription_id: input.providerSubscriptionId ?? null,
    })
    .eq("event_id", input.eventId);

  if (error) {
    throw new Error(`Failed to finalize Paddle webhook event: ${error.message}`);
  }
}

export function logPaddleWebhookSafe(input: {
  eventId: string;
  eventType: string;
  providerSubscriptionId?: string | null;
  workspaceId?: string | null;
  result: string;
}): void {
  console.info("[paddle/webhook]", {
    eventId: input.eventId,
    eventType: input.eventType,
    providerSubscriptionId: input.providerSubscriptionId ?? undefined,
    workspaceId: input.workspaceId ?? undefined,
    result: input.result,
  });
}
