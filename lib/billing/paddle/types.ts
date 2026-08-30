import type { BillingInterval } from "../plans";

/** Self-service paid tiers that map to Paddle checkout prices. */
export type PaddleCheckoutPlan = "starter" | "pro" | "business";

export type PaddleEnvironment = "sandbox" | "production";

export type PaddlePriceResolutionErrorCode =
  | "UNSUPPORTED_PLAN"
  | "CONTACT_SALES_ONLY"
  | "FREE_PLAN"
  | "CATALOG_NOT_CONFIGURED";

export type PaddlePriceResolution =
  | {
      ok: true;
      plan: PaddleCheckoutPlan;
      interval: BillingInterval;
      priceId: string;
      environment: PaddleEnvironment;
    }
  | {
      ok: false;
      code: PaddlePriceResolutionErrorCode;
      plan: string;
      interval: BillingInterval;
    };
