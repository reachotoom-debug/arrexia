import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPaddleEnvironment } from "../env.server";

export type PaddleWebhookEventStatus = "processing" | "processed" | "ignored" | "failed";
export type PaddleWebhookIdempotencyBeginResult =
  | { ok: true; state: "new"; claimToken: string }
  | { ok: true; state: "duplicate"; status: PaddleWebhookEventStatus; result: string | null }
  | { ok: false; state: "concurrent"; error: string };
export type PaddleWebhookIdempotencyRecordInput = {
  eventId: string; eventType: string; occurredAt: string;
  status: "failed" | "ignored"; result: string; claimToken: string;
};
type IdempotencyAdmin = Pick<ReturnType<typeof supabaseAdmin>, "rpc">;

export async function beginPaddleWebhookProcessing(
  input: Pick<PaddleWebhookIdempotencyRecordInput, "eventId" | "eventType" | "occurredAt">,
  admin: IdempotencyAdmin = supabaseAdmin()
): Promise<PaddleWebhookIdempotencyBeginResult> {
  if (getPaddleEnvironment() !== "production") return { ok: false, state: "concurrent", error: "production_billing_only" };
  const { data, error } = await admin.rpc("rpc_claim_paddle_webhook", {
    p_environment: "production",
    p_event_id: input.eventId, p_event_type: input.eventType, p_occurred_at: input.occurredAt,
  });
  if (error) return { ok: false, state: "concurrent", error: "webhook_claim_failed" };
  if (data?.state === "new" && typeof data.claim_token === "string") {
    return { ok: true, state: "new", claimToken: data.claim_token };
  }
  if (data?.state === "duplicate" && (data.status === "processed" || data.status === "ignored")) {
    return { ok: true, state: "duplicate", status: data.status, result: data.result ?? null };
  }
  return { ok: false, state: "concurrent", error: "webhook_claim_busy" };
}

/** Successful billing completion belongs to the atomic RPC, not this failure/ignore path. */
export async function finalizePaddleWebhookProcessing(
  input: PaddleWebhookIdempotencyRecordInput,
  admin: IdempotencyAdmin = supabaseAdmin()
): Promise<void> {
  const { data, error } = await admin.rpc("rpc_finish_paddle_webhook", {
    p_environment: "production",
    p_event_id: input.eventId, p_claim_token: input.claimToken, p_status: input.status, p_result: input.result,
  });
  if (error || data !== true) throw new Error("webhook_claim_completion_failed");
}

export function logPaddleWebhookSafe(input: {
  eventId: string; eventType: string; providerSubscriptionId?: string | null;
  workspaceId?: string | null; result: string;
}): void {
  console.info("[paddle/webhook]", input);
}
