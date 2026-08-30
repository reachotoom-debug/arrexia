import type { BillingInterval } from "../../plans";
import type { PaddleCheckoutPlan } from "../types";

export type ParsedPaddleCheckoutCustomData = {
  workspaceId?: string;
  plan?: PaddleCheckoutPlan;
  billingInterval?: BillingInterval;
};

function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

function isCheckoutPlan(value: string): value is PaddleCheckoutPlan {
  return value === "starter" || value === "pro" || value === "business";
}

/** Parses checkout customData for workspace hints only — plan/interval must still be price-validated. */
export function parsePaddleCheckoutCustomData(
  customData: unknown
): ParsedPaddleCheckoutCustomData {
  if (!customData || typeof customData !== "object") {
    return {};
  }

  const record = customData as Record<string, unknown>;
  const workspaceRaw = record.workspace_id ?? record.workspaceId;
  const planRaw = record.plan;
  const intervalRaw = record.billing_interval ?? record.billingInterval;

  const parsed: ParsedPaddleCheckoutCustomData = {};

  if (typeof workspaceRaw === "string" && workspaceRaw.trim()) {
    parsed.workspaceId = workspaceRaw.trim();
  }

  if (typeof planRaw === "string" && isCheckoutPlan(planRaw)) {
    parsed.plan = planRaw;
  }

  if (typeof intervalRaw === "string" && isBillingInterval(intervalRaw)) {
    parsed.billingInterval = intervalRaw;
  }

  return parsed;
}

export function extractPrimaryPaddlePriceId(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const price = record.price;
    if (price && typeof price === "object") {
      const priceId = (price as Record<string, unknown>).id;
      if (typeof priceId === "string" && priceId.startsWith("pri_")) {
        return priceId;
      }
    }

    const priceId = record.price_id ?? record.priceId;
    if (typeof priceId === "string" && priceId.startsWith("pri_")) {
      return priceId;
    }
  }

  return null;
}

export function extractBillingPeriod(
  source: unknown
): { startsAt: string | null; endsAt: string | null } {
  if (!source || typeof source !== "object") {
    return { startsAt: null, endsAt: null };
  }

  const record = source as Record<string, unknown>;
  const period =
    record.current_billing_period ??
    record.currentBillingPeriod ??
    record.billing_period ??
    record.billingPeriod;

  if (!period || typeof period !== "object") {
    return { startsAt: null, endsAt: null };
  }

  const periodRecord = period as Record<string, unknown>;
  const startsAt = periodRecord.starts_at ?? periodRecord.startsAt;
  const endsAt = periodRecord.ends_at ?? periodRecord.endsAt;

  return {
    startsAt: typeof startsAt === "string" ? startsAt : null,
    endsAt: typeof endsAt === "string" ? endsAt : null,
  };
}
