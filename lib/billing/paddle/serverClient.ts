import "server-only";

import { Environment, LogLevel, Paddle, type PaddleOptions } from "@paddle/paddle-node-sdk";

import { getPaddleApiKey, getPaddleEnvironment } from "./env.server";

let paddleServerInstance: Paddle | null = null;

/** Server-only Paddle SDK client (sandbox in this phase). */
export function getPaddleServerClient(): Paddle {
  if (paddleServerInstance) {
    return paddleServerInstance;
  }

  const apiKey = getPaddleApiKey();
  if (!apiKey) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }

  const configuredEnvironment = getPaddleEnvironment();
  if (configuredEnvironment !== "sandbox") {
    throw new Error("Live Paddle server API is not enabled in this phase.");
  }

  const options: PaddleOptions = {
    environment: Environment.sandbox,
    logLevel: LogLevel.error,
  };

  paddleServerInstance = new Paddle(apiKey, options);
  return paddleServerInstance;
}

/** Test-only reset for singleton initialization state. */
export function resetPaddleServerClientForTests(): void {
  paddleServerInstance = null;
}
