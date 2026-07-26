const CLIENT_PAYMENT_TERM_PRESETS = new Set(["0", "7", "15", "30", "45", "60"]);

export function resolveClientPaymentTermsPersistence(paymentTerms: string): {
  payment_terms: number;
  payment_terms_days: number;
} {
  if (!paymentTerms || paymentTerms === "custom") {
    return { payment_terms: 30, payment_terms_days: 30 };
  }

  const days = parseInt(paymentTerms, 10);
  if (Number.isNaN(days) || days < 0) {
    return { payment_terms: 30, payment_terms_days: 30 };
  }

  return { payment_terms: days, payment_terms_days: days };
}

export function resolveClientFormPaymentTerms(client: {
  payment_terms: string | number | null;
  payment_terms_days: number | null;
}): string {
  const fromDays = client.payment_terms_days;
  const fromLegacy =
    client.payment_terms != null ? parseInt(String(client.payment_terms), 10) : null;
  const days =
    fromDays != null && !Number.isNaN(fromDays)
      ? fromDays
      : fromLegacy != null && !Number.isNaN(fromLegacy)
        ? fromLegacy
        : 30;

  const asString = String(days);
  if (CLIENT_PAYMENT_TERM_PRESETS.has(asString)) {
    return asString;
  }

  return asString;
}

export function resolveClientFormStatus(
  client: {
    archived_at: string | null;
    is_active: boolean;
  }
): "active" | "inactive" {
  if (client.archived_at) {
    return "inactive";
  }
  return client.is_active === false ? "inactive" : "active";
}
