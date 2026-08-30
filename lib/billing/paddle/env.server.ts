import "server-only";

import { parsePaddleEnvironment } from "./parsePaddleEnvironment";
import type { PaddleEnvironment } from "./types";

export { parsePaddleEnvironment };

/** Paddle environment from NEXT_PUBLIC_PADDLE_ENV (safe to expose). */
export function getPaddleEnvironment(): PaddleEnvironment | null {
  return parsePaddleEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENV);
}

/** Server-side Paddle API key — never expose to the client. */
export function getPaddleApiKey(): string | undefined {
  const value = process.env.PADDLE_API_KEY?.trim();
  return value || undefined;
}

/** Webhook signature secret for the Paddle notification destination. */
export function getPaddleWebhookSecret(): string | undefined {
  const value = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  return value || undefined;
}

/** True when server-side Paddle credentials required for API/webhooks are present. */
export function isPaddleServerConfigured(): boolean {
  return Boolean(getPaddleApiKey() && getPaddleWebhookSecret() && getPaddleEnvironment());
}
