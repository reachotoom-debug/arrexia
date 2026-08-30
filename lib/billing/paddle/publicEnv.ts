import { parsePaddleEnvironment } from "./parsePaddleEnvironment";
import type { PaddleEnvironment } from "./types";

/**
 * Client-safe Paddle.js token (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN).
 * Not a secret — safe for browser checkout initialization.
 */
export function getPaddleClientToken(): string | undefined {
  const value = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  return value || undefined;
}

export function getPublicPaddleEnvironment(): PaddleEnvironment | null {
  return parsePaddleEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENV);
}

/** True when public Paddle.js checkout prerequisites are present. */
export function isPaddleClientConfigured(): boolean {
  return Boolean(getPaddleClientToken() && getPublicPaddleEnvironment());
}
