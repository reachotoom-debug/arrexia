import type { BillingInterval } from "../plans";
import {
  buildPaddleCheckoutCustomerOpenArg,
  type PaddleCheckoutCustomerOpenArg,
} from "./checkoutCustomerIdentity";
import { resolvePaddlePriceId } from "./priceCatalog";
import type { PaddleCheckoutPlan, PaddleEnvironment } from "./types";

export type BuildCheckoutOpenOptionsInput = {
  plan: PaddleCheckoutPlan;
  interval: BillingInterval;
  workspaceId?: string;
  customerId?: string;
  customerEmail?: string;
  environment?: PaddleEnvironment;
};

export type CheckoutCustomData = {
  workspace_id?: string;
  plan: PaddleCheckoutPlan;
  billing_interval: BillingInterval;
};

export type BuildCheckoutOpenOptionsResult =
  | {
      ok: true;
      priceId: string;
      customData: CheckoutCustomData;
      checkoutCustomer?: PaddleCheckoutCustomerOpenArg;
    }
  | {
      ok: false;
      code:
        | "CONTACT_SALES_ONLY"
        | "FREE_PLAN"
        | "UNSUPPORTED_PLAN"
        | "CATALOG_NOT_CONFIGURED";
      plan: string;
      interval: BillingInterval;
    };

/** Resolves a checkout price and assembles safe Paddle Checkout.open inputs. */
export function buildCheckoutOpenOptions(
  input: BuildCheckoutOpenOptionsInput
): BuildCheckoutOpenOptionsResult {
  const environment = input.environment ?? "sandbox";
  const resolution = resolvePaddlePriceId(input.plan, input.interval, environment);

  if (!resolution.ok) {
    return {
      ok: false,
      code: resolution.code,
      plan: resolution.plan,
      interval: resolution.interval,
    };
  }

  const customData: CheckoutCustomData = {
    plan: resolution.plan,
    billing_interval: resolution.interval,
  };

  if (input.workspaceId) {
    customData.workspace_id = input.workspaceId;
  }

  const checkoutCustomer = buildPaddleCheckoutCustomerOpenArg({
    customerId: input.customerId,
    customerEmail: input.customerEmail,
  });

  return {
    ok: true,
    priceId: resolution.priceId,
    customData,
    checkoutCustomer,
  };
}
