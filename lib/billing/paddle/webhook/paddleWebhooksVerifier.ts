import "server-only";

import { NodeRuntime, Webhooks } from "@paddle/paddle-node-sdk";

let paddleNodeRuntimeInitialized = false;
let paddleWebhooksVerifier: Webhooks | null = null;

/**
 * Standalone `Webhooks` requires NodeRuntime crypto registration.
 * The SDK only calls NodeRuntime.initialize() from the Paddle client constructor.
 */
export function ensurePaddleNodeRuntimeInitialized(): void {
  if (!paddleNodeRuntimeInitialized) {
    NodeRuntime.initialize();
    paddleNodeRuntimeInitialized = true;
  }
}

export function getPaddleWebhooksVerifier(): Webhooks {
  ensurePaddleNodeRuntimeInitialized();
  if (!paddleWebhooksVerifier) {
    paddleWebhooksVerifier = new Webhooks();
  }
  return paddleWebhooksVerifier;
}

/** @internal test hook */
export function resetPaddleWebhooksVerifierForTests(): void {
  paddleWebhooksVerifier = null;
  paddleNodeRuntimeInitialized = false;
}
