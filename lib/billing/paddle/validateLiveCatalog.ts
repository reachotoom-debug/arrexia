import { getPlanDefinition, type BillingInterval } from "../plans";
import { PADDLE_PRODUCTION_PRICE_CATALOG } from "./priceCatalog";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

/** Validates non-sensitive Live API/dashboard metadata; does not access an account. */
export function validateLivePaddleCatalog(prices: readonly unknown[]): Array<{
  plan: string; interval: BillingInterval; priceId: string; issues: string[];
}> {
  return Object.entries(PADDLE_PRODUCTION_PRICE_CATALOG).flatMap(([plan, catalog]) =>
    Object.entries(catalog).map(([interval, priceId]) => {
      const matches = prices.map(record).filter(price => price.id === priceId);
      const issues: string[] = [];
      if (matches.length !== 1) issues.push(matches.length ? "duplicate_price" : "missing_price");
      const price = matches[0];
      if (price) {
        const product = record(price.product);
        const unit = record(price.unit_price);
        const cycle = record(price.billing_cycle);
        const definition = getPlanDefinition(plan as "starter" | "pro" | "business");
        const amount = interval === "annual" ? definition.annualPrice! : definition.monthlyPrice!;
        if (price.status !== "active") issues.push("inactive_price");
        if (!price.product_id || product.id !== price.product_id || product.name !== `Arrexia ${definition.name}`) issues.push("product_mismatch");
        if (product.status !== "active") issues.push("inactive_product");
        if (unit.amount !== String(amount * 100)) issues.push("amount_mismatch");
        if (unit.currency_code !== "USD") issues.push("currency_mismatch");
        if (cycle.frequency !== 1 || cycle.interval !== (interval === "annual" ? "year" : "month")) issues.push("billing_cycle_mismatch");
        if (price.trial_period !== null) issues.push("unexpected_paddle_trial");
        if (Array.isArray(price.unit_price_overrides) && price.unit_price_overrides.length) issues.push("regional_price_overrides_require_review");
      }
      return { plan, interval: interval as BillingInterval, priceId, issues };
    }));
}
