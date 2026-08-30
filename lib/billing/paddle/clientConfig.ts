import { parsePaddleEnvironment } from "./parsePaddleEnvironment";
import type { PaddleEnvironment } from "./types";

export type PaddleClientConfigErrorCode =
  | "MISSING_CLIENT_TOKEN"
  | "MISSING_ENVIRONMENT"
  | "PRODUCTION_NOT_ENABLED";

export type PaddleClientConfig =
  | {
      ok: true;
      token: string;
      environment: PaddleEnvironment;
    }
  | {
      ok: false;
      code: PaddleClientConfigErrorCode;
    };

/** Reads public Paddle.js configuration available in browser and test environments. */
export function getPaddleClientConfig(): PaddleClientConfig {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  if (!token) {
    return { ok: false, code: "MISSING_CLIENT_TOKEN" };
  }

  const environment = parsePaddleEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENV);
  if (!environment) {
    return { ok: false, code: "MISSING_ENVIRONMENT" };
  }

  if (environment === "production") {
    return { ok: false, code: "PRODUCTION_NOT_ENABLED" };
  }

  return { ok: true, token, environment };
}

export function getPaddleClientConfigErrorMessage(code: PaddleClientConfigErrorCode): string {
  switch (code) {
    case "MISSING_CLIENT_TOKEN":
      return "Paddle checkout is not configured. Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.";
    case "MISSING_ENVIRONMENT":
      return "Paddle checkout is not configured. Missing NEXT_PUBLIC_PADDLE_ENV.";
    case "PRODUCTION_NOT_ENABLED":
      return "Live Paddle checkout is not enabled yet. Use sandbox during development.";
    default:
      return "Paddle checkout is not configured.";
  }
}
