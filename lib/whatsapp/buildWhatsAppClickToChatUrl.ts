import { normalizePhone } from "@/lib/import/normalize";

/** Minimum digit count for international WhatsApp numbers (after country code). */
const MIN_INTERNATIONAL_DIGITS = 8;

/** E.164 maximum length (country code + subscriber number). */
const MAX_INTERNATIONAL_DIGITS = 15;

/**
 * Resolve a stored client phone to digits-only international format for wa.me.
 *
 * V1 limitation: only numbers with an explicit leading "+" (international prefix)
 * are accepted after normalization. Local numbers without a country code are
 * rejected — we do not assume Jordan or any other default country.
 */
export function resolveInternationalWhatsAppDigits(
  rawPhone: string | null | undefined
): string | null {
  if (!rawPhone?.trim()) return null;

  const normalized = normalizePhone(rawPhone.trim());
  if (!normalized?.startsWith("+")) return null;

  const digits = normalized.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length < MIN_INTERNATIONAL_DIGITS || digits.length > MAX_INTERNATIONAL_DIGITS) {
    return null;
  }

  return digits;
}

export function buildWhatsAppClickToChatUrl(params: {
  phone: string | null | undefined;
  message: string;
}): string | null {
  const digits = resolveInternationalWhatsAppDigits(params.phone);
  if (!digits) return null;

  const message = params.message.trim();
  if (!message) return null;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
