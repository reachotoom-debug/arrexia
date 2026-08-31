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

/** Verified Paddle Live catalog — centralized for checkout wiring. */
export const PADDLE_PRODUCTION_PRICE_CATALOG: Readonly<
  Record<PaddleCheckoutPlan, Readonly<Record<BillingInterval, string>>>
> = {
  starter: {
    monthly: "pri_01m1at62xv6w2m6qs1phhv9dcr",
    annual: "pri_01m1at9cd7hb9ppq4hg2hj39dj",
  },
  pro: {
    monthly: "pri_01m1ate0g915aeyvcf0y7kwr1z",
    annual: "pri_01m1atg3nvsrvkqhcfrrww1sdh0",
  },
  business: {
    monthly: "pri_01m1atnep0q6m6a8c77ht58z6h",
    annual: "pri_01m1atpxgh4t3msdn24hh45htd",
  },
} as const;

export function isPaddleCheckoutPlan(plan: string): plan is PaddleCheckoutPlan {
  return plan === "starter" || plan === "pro" || plan === "business";
}

export function getPaddlePriceCatalog(
  environment: PaddleEnvironment
): Readonly<Record<PaddleCheckoutPlan, Readonly<Record<BillingInterval, string>>>> {
  if (environment === "production") {
    return PADDLE_PRODUCTION_PRICE_CATALOG;
  }
  return PADDLE_SANDBOX_PRICE_CATALOG;
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

  for (const plan of ["starter", "pro", "business"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (catalog[plan][interval] === priceId) {
        return { ok: true, plan, interval, priceId, environment };
      }
    }
  }

  return { ok: false, code: "UNKNOWN_PRICE_ID", priceId, environment };
}
