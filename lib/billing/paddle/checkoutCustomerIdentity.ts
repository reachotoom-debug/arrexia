/** Paddle Checkout.open customer argument — id and email are mutually exclusive. */
export type PaddleCheckoutCustomerOpenArg =
  | { id: string; email?: never }
  | { email: string; id?: never };

export function isValidPaddleCustomerId(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && /^ctm_[a-z0-9]+$/i.test(trimmed);
}

export function isValidPaddleSubscriptionId(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && /^sub_[a-z0-9]+$/i.test(trimmed);
}

export function buildPaddleCheckoutCustomerOpenArg(input: {
  customerId?: string | null;
  customerEmail?: string | null;
}): PaddleCheckoutCustomerOpenArg | undefined {
  if (isValidPaddleCustomerId(input.customerId)) {
    return { id: input.customerId.trim() };
  }

  const email = input.customerEmail?.trim();
  if (email) {
    return { email };
  }

  return undefined;
}
