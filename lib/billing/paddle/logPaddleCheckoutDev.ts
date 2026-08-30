type PaddleCheckoutDevMeta = {
  plan?: string;
  interval?: string;
  priceId?: string;
  environment?: string;
  httpStatus?: number;
};

import type { PaddleEventData } from "@paddle/paddle-js";

function isPaddleCheckoutErrorEvent(eventName: string | undefined): boolean {
  if (!eventName) return false;
  return (
    eventName === "checkout.error" ||
    eventName === "checkout.failed" ||
    eventName === "checkout.payment.failed" ||
    eventName === "checkout.payment.error"
  );
}

/** Dev-only structured logging for Paddle checkout diagnostics (no secrets). */
export function logPaddleCheckoutDev(
  context: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "development") return;
  console.error(`[paddle/checkout/${context}]`, payload);
}

export function logPaddleCheckoutOpenDev(
  meta: Required<Pick<PaddleCheckoutDevMeta, "plan" | "interval" | "priceId" | "environment">> & {
    customDataKeys: string[];
    customerMode: "id" | "email" | "none";
  },
): void {
  logPaddleCheckoutDev("open", meta);
}

export function logPaddleCheckoutEventDev(
  event: PaddleEventData,
  meta?: PaddleCheckoutDevMeta,
): void {
  if (!isPaddleCheckoutErrorEvent(event.name) && event.name !== "checkout.loaded") {
    return;
  }

  logPaddleCheckoutDev("event", {
    eventName: event.name,
    type: event.type,
    code: event.code,
    detail: event.detail,
    documentationUrl: event.documentation_url,
    checkoutId: event.data?.id,
    transactionId: event.data?.transaction_id,
    customDataKeys:
      event.data?.custom_data && typeof event.data.custom_data === "object"
        ? Object.keys(event.data.custom_data as Record<string, unknown>)
        : undefined,
    ...meta,
  });
}

export { isPaddleCheckoutErrorEvent };
