import "server-only";

import { Environment, LogLevel, Paddle, type PaddleOptions } from "@paddle/paddle-node-sdk";

import { getPaddleApiKey, getPaddleEnvironment } from "./env.server";
import type { PaddleEnvironment } from "./types";

let paddleServerInstance: Paddle | null = null;

function toSdkEnvironment(environment: PaddleEnvironment): Environment {
  return environment === "production" ? Environment.production : Environment.sandbox;
}

/** Server-only Paddle SDK client for the configured environment. */
export function getPaddleServerClient(): Paddle {
  if (paddleServerInstance) {
    return paddleServerInstance;
  }

  const apiKey = getPaddleApiKey();
  if (!apiKey) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }

  const configuredEnvironment = getPaddleEnvironment();
  if (!configuredEnvironment) {
    throw new Error("NEXT_PUBLIC_PADDLE_ENV is not configured.");
  }

  const options: PaddleOptions = {
    environment: toSdkEnvironment(configuredEnvironment),
    logLevel: LogLevel.error,
  };

  paddleServerInstance = new Paddle(apiKey, options);
  return paddleServerInstance;
}

/** Test-only reset for singleton initialization state. */
export function resetPaddleServerClientForTests(): void {
  paddleServerInstance = null;
}
