"use client";

import type { BillingInterval } from "../plans";
import {
  buildCheckoutOpenOptions,
  type BuildCheckoutOpenOptionsInput,
} from "./buildCheckoutOpenOptions";
import {
  getPaddleClientConfig,
  getPaddleClientConfigErrorMessage,
} from "./clientConfig";
import {
  getPaddleCheckoutUxMessage,
  mapPaddleCheckoutUxPhase,
  type PaddleCheckoutUxPhase,
} from "./checkoutUx";
import { initializePaddleClient, subscribePaddleCheckoutEvents } from "./initializePaddleClient";
import {
  logPaddleCheckoutEventDev,
  logPaddleCheckoutOpenDev,
} from "./logPaddleCheckoutDev";
import type { PaddleCheckoutPlan } from "./types";

export type OpenPaddleCheckoutInput = {
  plan: PaddleCheckoutPlan;
  interval: BillingInterval;
  workspaceId?: string;
  customerId?: string;
  customerEmail?: string;
  onUxEvent?: (phase: PaddleCheckoutUxPhase) => void;
};

export type OpenPaddleCheckoutResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "MISSING_CLIENT_TOKEN"
        | "MISSING_ENVIRONMENT"
        | "PRODUCTION_NOT_ENABLED"
        | "INIT_FAILED"
        | "CONTACT_SALES_ONLY"
        | "FREE_PLAN"
        | "UNSUPPORTED_PLAN"
        | "CATALOG_NOT_CONFIGURED"
        | "OPEN_FAILED";
      message: string;
    };

export async function openPaddleCheckout(
  input: OpenPaddleCheckoutInput
): Promise<OpenPaddleCheckoutResult> {
  const clientConfig = getPaddleClientConfig();
  if (!clientConfig.ok) {
    return {
      ok: false,
      code: clientConfig.code,
      message: getPaddleClientConfigErrorMessage(clientConfig.code),
    };
  }

  const checkoutOptions = buildCheckoutOpenOptions({
    plan: input.plan,
    interval: input.interval,
    workspaceId: input.workspaceId,
    customerId: input.customerId,
    customerEmail: input.customerEmail,
    environment: clientConfig.environment,
  } satisfies BuildCheckoutOpenOptionsInput);

  if (!checkoutOptions.ok) {
    return {
      ok: false,
      code: checkoutOptions.code,
      message:
        checkoutOptions.code === "CONTACT_SALES_ONLY"
          ? "Enterprise plans require Contact Sales."
          : "This plan is not available for Paddle checkout.",
    };
  }

  const initResult = await initializePaddleClient();
  if (!initResult.ok) {
    return {
      ok: false,
      code: initResult.error.code,
      message: initResult.error.message,
    };
  }

  const unsubscribe = subscribePaddleCheckoutEvents((event) => {
    logPaddleCheckoutEventDev(event, {
      plan: input.plan,
      interval: input.interval,
      priceId: checkoutOptions.priceId,
      environment: clientConfig.environment,
    });

    if (!event.name) {
      return;
    }
    const phase = mapPaddleCheckoutUxPhase(event.name);
    if (phase) {
      input.onUxEvent?.(phase);
    }
  });

  try {
    const customerMode = checkoutOptions.checkoutCustomer
      ? "id" in checkoutOptions.checkoutCustomer
        ? "id"
        : "email"
      : "none";

    logPaddleCheckoutOpenDev({
      plan: input.plan,
      interval: input.interval,
      priceId: checkoutOptions.priceId,
      environment: clientConfig.environment,
      customDataKeys: Object.keys(checkoutOptions.customData),
      customerMode,
    });

    initResult.paddle.Checkout.open({
      items: [{ priceId: checkoutOptions.priceId, quantity: 1 }],
      customData: checkoutOptions.customData,
      ...(checkoutOptions.checkoutCustomer
        ? { customer: checkoutOptions.checkoutCustomer }
        : {}),
      settings: {
        variant: "one-page",
      },
    });
    return { ok: true };
  } catch (error) {
    unsubscribe();
    return {
      ok: false,
      code: "OPEN_FAILED",
      message:
        error instanceof Error ? error.message : "Paddle checkout could not be opened.",
    };
  }
}

export function getOpenPaddleCheckoutUxMessage(phase: PaddleCheckoutUxPhase): string {
  return getPaddleCheckoutUxMessage(phase);
}
