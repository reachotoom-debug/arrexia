"use client";

import {
  initializePaddle,
  type Paddle,
  type PaddleEventData,
} from "@paddle/paddle-js";
import {
  getPaddleClientConfig,
  getPaddleClientConfigErrorMessage,
  type PaddleClientConfigErrorCode,
} from "./clientConfig";

export type PaddleClientInitError = {
  code: PaddleClientConfigErrorCode | "INIT_FAILED";
  message: string;
};

export type PaddleClientInitResult =
  | { ok: true; paddle: Paddle }
  | { ok: false; error: PaddleClientInitError };

type PaddleEventListener = (event: PaddleEventData) => void;

const listeners = new Set<PaddleEventListener>();
let initPromise: Promise<PaddleClientInitResult> | null = null;
let paddleInstance: Paddle | null = null;

export function subscribePaddleCheckoutEvents(listener: PaddleEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dispatchPaddleEvent(event: PaddleEventData): void {
  for (const listener of listeners) {
    listener(event);
  }
}

/** Initializes Paddle.js once for overlay checkout in the browser. */
export async function initializePaddleClient(): Promise<PaddleClientInitResult> {
  if (paddleInstance) {
    return { ok: true, paddle: paddleInstance };
  }

  if (!initPromise) {
    initPromise = (async (): Promise<PaddleClientInitResult> => {
      const config = getPaddleClientConfig();
      if (!config.ok) {
        return {
          ok: false,
          error: {
            code: config.code,
            message: getPaddleClientConfigErrorMessage(config.code),
          },
        };
      }

      try {
        const paddle = await initializePaddle({
          token: config.token,
          environment: config.environment,
          eventCallback: (event) => {
            dispatchPaddleEvent(event);
          },
        });

        if (!paddle) {
          return {
            ok: false,
            error: {
              code: "INIT_FAILED",
              message: "Paddle checkout failed to initialize.",
            },
          };
        }

        paddleInstance = paddle;
        return { ok: true, paddle };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "INIT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Paddle checkout failed to initialize.",
          },
        };
      }
    })();
  }

  return initPromise;
}

/** Test-only reset for singleton initialization state. */
export function resetPaddleClientForTests(): void {
  initPromise = null;
  paddleInstance = null;
  listeners.clear();
}
