import { normalizePhone } from "@/lib/import/normalize";
import { resolveCountryPhoneMetadata } from "./resolveCountryPhoneMetadata";

/** Minimum digit count for international WhatsApp numbers (after country code). */
const MIN_INTERNATIONAL_DIGITS = 8;

/** E.164 maximum length (country code + subscriber number). */
const MAX_INTERNATIONAL_DIGITS = 15;

function isValidInternationalDigits(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  return digits.length >= MIN_INTERNATIONAL_DIGITS && digits.length <= MAX_INTERNATIONAL_DIGITS;
}

/**
 * Resolve a stored client phone to digits-only international format for wa.me.
 *
 * Rules:
 * - Numbers with "+" are normalized and used as-is (formatting stripped).
 * - Local numbers require the client's country to resolve a dialing code.
 * - Country is taken from the client record only — never workspace/browser locale.
 */
export function resolveInternationalWhatsAppDigits(
  rawPhone: string | null | undefined,
  clientCountry?: string | null
): string | null {
  if (!rawPhone?.trim()) return null;

  const normalized = normalizePhone(rawPhone.trim());
  if (!normalized) return null;

  if (normalized.startsWith("+")) {
    const digits = normalized.slice(1);
    return isValidInternationalDigits(digits) ? digits : null;
  }

  const countryMetadata = resolveCountryPhoneMetadata(clientCountry);
  if (!countryMetadata) return null;

  let subscriberDigits = normalized.replace(/\D/g, "");
  if (!subscriberDigits) return null;

  if (
    countryMetadata.trunkPrefix &&
    subscriberDigits.startsWith(countryMetadata.trunkPrefix)
  ) {
    subscriberDigits = subscriberDigits.slice(countryMetadata.trunkPrefix.length);
  }

  if (!subscriberDigits) return null;

  const digits = `${countryMetadata.dialCode}${subscriberDigits}`;
  return isValidInternationalDigits(digits) ? digits : null;
}

export function buildWhatsAppClickToChatUrl(params: {
  phone: string | null | undefined;
  clientCountry?: string | null;
  message: string;
}): string | null {
  const digits = resolveInternationalWhatsAppDigits(params.phone, params.clientCountry);
  if (!digits) return null;

  const message = params.message.trim();
  if (!message) return null;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
