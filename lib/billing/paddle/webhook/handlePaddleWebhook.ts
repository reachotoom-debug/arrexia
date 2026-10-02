import "server-only";

import type { EventEntity } from "@paddle/paddle-node-sdk";

import { getPaddleWebhookSecret } from "../env.server";
import {
  logPaddleWebhookSafe,
} from "./paddleWebhookIdempotency";
import { logPaddleWebhookVerifyDev } from "./logPaddleWebhookDev";
import {
  getPaddleWebhooksVerifier,
  resetPaddleWebhooksVerifierForTests,
} from "./paddleWebhooksVerifier";
import { processPaddleWebhookEvent } from "./processPaddleWebhookEvent";
import { deliverBillingEmailNotification } from "../../billingEmailDelivery";

export type HandlePaddleWebhookResult =
  | { ok: true; status: 200; duplicate: boolean; result: string }
  | { ok: false; status: 400 | 401 | 500; error: string };

export { resetPaddleWebhooksVerifierForTests };

export async function handleVerifiedPaddleWebhookEvent(event: EventEntity): Promise<HandlePaddleWebhookResult> {
  const processed = await processPaddleWebhookEvent(event);
  logPaddleWebhookSafe({ eventId: event.eventId, eventType: event.eventType,
    workspaceId: processed.ok ? processed.workspaceId : undefined, result: processed.reason });
  if (!processed.ok) return { ok: false, status: 500, error: processed.reason };
  if (processed.notificationId) {
    // Bounded attempt; failure cannot undo payment or lose durable intent. Cron recovers.
    await deliverBillingEmailNotification(processed.notificationId).catch(() => undefined);
  }
  return { ok: true, status: 200, duplicate: processed.duplicate ?? false, result: processed.reason };
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
