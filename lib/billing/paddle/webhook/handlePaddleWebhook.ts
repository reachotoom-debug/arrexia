import "server-only";

import type { EventEntity } from "@paddle/paddle-node-sdk";

import { getPaddleWebhookSecret } from "../env.server";
import {
  beginPaddleWebhookProcessing,
  finalizePaddleWebhookProcessing,
  logPaddleWebhookSafe,
} from "./paddleWebhookIdempotency";
import { logPaddleWebhookVerifyDev } from "./logPaddleWebhookDev";
import {
  getPaddleWebhooksVerifier,
  resetPaddleWebhooksVerifierForTests,
} from "./paddleWebhooksVerifier";
import { processPaddleWebhookEvent } from "./processPaddleWebhookEvent";

export type HandlePaddleWebhookResult =
  | { ok: true; status: 200; duplicate: boolean; result: string }
  | { ok: false; status: 400 | 401 | 500; error: string };

export { resetPaddleWebhooksVerifierForTests };

function readProviderSubscriptionId(event: EventEntity): string | null {
  const data = event.data as unknown as Record<string, unknown>;
  const subscriptionId = data.subscription_id ?? data.subscriptionId ?? data.id;
  return typeof subscriptionId === "string" ? subscriptionId : null;
}

function readWorkspaceHint(event: EventEntity): string | null {
  const data = event.data as unknown as Record<string, unknown>;
  const customData = data.custom_data ?? data.customData;
  if (!customData || typeof customData !== "object") {
    return null;
  }
  const workspaceId = (customData as Record<string, unknown>).workspace_id;
  return typeof workspaceId === "string" ? workspaceId : null;
}

export async function handleVerifiedPaddleWebhookEvent(
  event: EventEntity
): Promise<HandlePaddleWebhookResult> {
  const idempotency = await beginPaddleWebhookProcessing({
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    workspaceId: readWorkspaceHint(event),
    providerSubscriptionId: readProviderSubscriptionId(event),
  });

  if (!idempotency.ok) {
    return {
      ok: false,
      status: idempotency.state === "missing_table" ? 500 : 500,
      error: idempotency.error,
    };
  }

  if (idempotency.state === "duplicate") {
    logPaddleWebhookSafe({
      eventId: event.eventId,
      eventType: event.eventType,
      result: `duplicate:${idempotency.status}`,
    });
    return {
      ok: true,
      status: 200,
      duplicate: true,
      result: idempotency.result ?? idempotency.status,
    };
  }

  try {
    const processed = await processPaddleWebhookEvent(event);
    const finalStatus = processed.ok
      ? processed.action === "ignored"
        ? "ignored"
        : "processed"
      : "failed";

    await finalizePaddleWebhookProcessing({
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      status: finalStatus,
      result: processed.ok ? processed.reason : processed.reason,
      workspaceId: processed.ok ? processed.workspaceId ?? readWorkspaceHint(event) : readWorkspaceHint(event),
      providerSubscriptionId: readProviderSubscriptionId(event),
    });

    logPaddleWebhookSafe({
      eventId: event.eventId,
      eventType: event.eventType,
      providerSubscriptionId: readProviderSubscriptionId(event),
      workspaceId: processed.ok ? processed.workspaceId : readWorkspaceHint(event),
      result: processed.ok ? processed.reason : processed.reason,
    });

    if (!processed.ok && processed.retryable) {
      return { ok: false, status: 500, error: processed.reason };
    }

    return {
      ok: true,
      status: 200,
      duplicate: false,
      result: processed.ok ? processed.reason : processed.reason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await finalizePaddleWebhookProcessing({
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      status: "failed",
      result: message,
      workspaceId: readWorkspaceHint(event),
      providerSubscriptionId: readProviderSubscriptionId(event),
    }).catch(() => undefined);

    logPaddleWebhookSafe({
      eventId: event.eventId,
      eventType: event.eventType,
      result: `failed:${message}`,
    });

    return { ok: false, status: 500, error: message };
  }
}

export async function handlePaddleWebhookRequest(
  input: {
    rawBody: string;
    signature: string | null;
  },
  deps?: {
    unmarshal?: (
      rawBody: string,
      secret: string,
      signature: string
    ) => Promise<EventEntity>;
    handleVerifiedEvent?: typeof handleVerifiedPaddleWebhookEvent;
  }
): Promise<HandlePaddleWebhookResult> {
  const secret = getPaddleWebhookSecret();
  const webhookSecretPresent = Boolean(secret);

  if (!secret) {
    logPaddleWebhookVerifyDev({
      webhookSecretPresent: false,
      signaturePresent: Boolean(input.signature),
      rawBodyByteLength: Buffer.byteLength(input.rawBody ?? "", "utf8"),
      verificationErrorMessage: "Paddle webhook secret is not configured.",
      eventParsed: false,
    });
    return { ok: false, status: 500, error: "Paddle webhook secret is not configured." };
  }

  if (!input.signature || !input.rawBody) {
    logPaddleWebhookVerifyDev({
      webhookSecretPresent: true,
      signaturePresent: Boolean(input.signature),
      rawBodyByteLength: Buffer.byteLength(input.rawBody ?? "", "utf8"),
      verificationErrorMessage: "Missing Paddle signature or body.",
      eventParsed: false,
    });
    return { ok: false, status: 400, error: "Missing Paddle signature or body." };
  }

  try {
    const unmarshal =
      deps?.unmarshal ??
      (async (rawBody: string, webhookSecret: string, signature: string) => {
        return getPaddleWebhooksVerifier().unmarshal(rawBody, webhookSecret, signature);
      });

    const event = await unmarshal(input.rawBody, secret, input.signature);
    const handleVerifiedEvent = deps?.handleVerifiedEvent ?? handleVerifiedPaddleWebhookEvent;
    return handleVerifiedEvent(event);
  } catch (error) {
    const verificationErrorName = error instanceof Error ? error.name : "Error";
    const verificationErrorMessage =
      error instanceof Error ? error.message : "Webhook verification failed.";

    logPaddleWebhookVerifyDev({
      webhookSecretPresent: true,
      signaturePresent: true,
      rawBodyByteLength: Buffer.byteLength(input.rawBody, "utf8"),
      verificationErrorName,
      verificationErrorMessage,
      eventParsed: false,
    });

    return { ok: false, status: 401, error: "Invalid Paddle webhook signature." };
  }
}
