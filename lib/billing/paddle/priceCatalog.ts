import type { BillingInterval, PlanId, WorkspacePlan } from "../plans";
import type {
  PaddleCheckoutPlan,
  PaddleEnvironment,
  PaddlePriceResolution,
} from "./types";

/** Verified Paddle Sandbox catalog — centralized for checkout wiring. */
export const PADDLE_SANDBOX_PRICE_CATALOG: Readonly<
  Record<PaddleCheckoutPlan, Readonly<Record<BillingInterval, string>>>
> = {
  starter: {
    monthly: "pri_01m160et1jrsbnb0hftets4ej2",
    annual: "pri_01m160etc13kbxmwthd37pt3zj",
  },
  pro: {
    monthly: "pri_01m160evbf5cecq92r62bwkt95",
    annual: "pri_01m160evjx58qzrjge92aq8mrc",
  },
  business: {
    monthly: "pri_01m160ew3067phsj76b75twrkp",
    annual: "pri_01m160ewapjmxdq6ttp4565abw",
  },
} as const;

export function isPaddleCheckoutPlan(plan: string): plan is PaddleCheckoutPlan {
  return plan === "starter" || plan === "pro" || plan === "business";
}

export function getPaddlePriceCatalog(
  environment: PaddleEnvironment
): Readonly<Record<PaddleCheckoutPlan, Readonly<Record<BillingInterval, string>>>> | null {
  if (environment === "sandbox") {
    return PADDLE_SANDBOX_PRICE_CATALOG;
  }
  return null;
}

/**
 * Resolves an Arrexia plan + billing interval to a Paddle price ID.
 * Enterprise and free never resolve — checkout remains unavailable for those tiers.
 */
export function resolvePaddlePriceId(
  plan: WorkspacePlan | PlanId,
  interval: BillingInterval,
  environment: PaddleEnvironment = "sandbox"
): PaddlePriceResolution {
  if (plan === "enterprise") {
    return { ok: false, code: "CONTACT_SALES_ONLY", plan, interval };
  }

  if (plan === "free") {
    return { ok: false, code: "FREE_PLAN", plan, interval };
  }

  if (!isPaddleCheckoutPlan(plan)) {
    return { ok: false, code: "UNSUPPORTED_PLAN", plan, interval };
  }

  const catalog = getPaddlePriceCatalog(environment);
  if (!catalog) {
    return { ok: false, code: "CATALOG_NOT_CONFIGURED", plan, interval };
  }

  const priceId = catalog[plan][interval];
  return { ok: true, plan, interval, priceId, environment };
}

export type PaddlePriceCatalogResolution =
  | {
      ok: true;
      plan: PaddleCheckoutPlan;
      interval: BillingInterval;
      priceId: string;
      environment: PaddleEnvironment;
    }
  | {
      ok: false;
      code: "UNKNOWN_PRICE_ID";
      priceId: string;
      environment: PaddleEnvironment;
    };

/** Reverse lookup: derive canonical plan + interval from a verified Paddle price ID. */
export function resolvePlanFromPaddlePriceId(
  priceId: string,
  environment: PaddleEnvironment = "sandbox"
): PaddlePriceCatalogResolution {
  const catalog = getPaddlePriceCatalog(environment);
  if (!catalog) {
    return { ok: false, code: "UNKNOWN_PRICE_ID", priceId, environment };
  }

  for (const plan of ["starter", "pro", "business"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (catalog[plan][interval] === priceId) {
        return { ok: true, plan, interval, priceId, environment };
      }
    }
  }

  return { ok: false, code: "UNKNOWN_PRICE_ID", priceId, environment };
}
