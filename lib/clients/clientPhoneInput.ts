import { normalizePhone } from "@/lib/import/normalize";
import { resolveCountryPhoneMetadata } from "@/lib/whatsapp/resolveCountryPhoneMetadata";

/** Visible dial prefix for a stored country name, e.g. "+962". */
export function formatCountryDialPrefix(country: string | null | undefined): string | null {
  const meta = resolveCountryPhoneMetadata(country);
  if (!meta?.dialCode) return null;
  return `+${meta.dialCode}`;
}

/**
 * Split a persisted contact number into form display value + whether the country prefix applies.
 * International numbers matching the selected country show the national part beside the prefix.
 */
export function splitContactNumberForDisplay(
  stored: string | null | undefined,
  country: string | null | undefined
): { inputValue: string; showCountryPrefix: boolean } {
  const trimmed = stored?.trim();
  if (!trimmed) {
    return { inputValue: "", showCountryPrefix: true };
  }

  const meta = resolveCountryPhoneMetadata(country);

  if (trimmed.startsWith("+")) {
    const normalized = normalizePhone(trimmed);
    if (!normalized) {
      return { inputValue: trimmed, showCountryPrefix: false };
    }

    const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
    if (meta && digits.startsWith(meta.dialCode)) {
      let national = digits.slice(meta.dialCode.length);
      if (meta.trunkPrefix && national.startsWith(meta.trunkPrefix)) {
        national = national.slice(meta.trunkPrefix.length);
      }
      return { inputValue: national, showCountryPrefix: true };
    }

    return { inputValue: normalized, showCountryPrefix: false };
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (meta && digitsOnly.startsWith(meta.dialCode)) {
    let national = digitsOnly.slice(meta.dialCode.length);
    if (meta.trunkPrefix && national.startsWith(meta.trunkPrefix)) {
      national = national.slice(meta.trunkPrefix.length);
    }
    return { inputValue: national || digitsOnly, showCountryPrefix: true };
  }

  if (meta?.trunkPrefix && trimmed.startsWith(meta.trunkPrefix)) {
    return { inputValue: trimmed.slice(meta.trunkPrefix.length), showCountryPrefix: true };
  }

  return { inputValue: trimmed, showCountryPrefix: true };
}

/**
 * Normalize manual client Phone/WhatsApp input for storage.
 * Preserves explicit international (+…) numbers; local numbers inherit the client country dial code.
 */
export function normalizeClientContactNumberForStorage(
  raw: string | null | undefined,
  country: string | null | undefined
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    return normalizePhone(trimmed);
  }

  const meta = resolveCountryPhoneMetadata(country);
  if (!meta) {
    return normalizePhone(trimmed);
  }

  let subscriber = trimmed.replace(/\D/g, "");
  if (!subscriber) return null;

  if (meta.trunkPrefix && subscriber.startsWith(meta.trunkPrefix)) {
    subscriber = subscriber.slice(meta.trunkPrefix.length);
  }

  if (!subscriber) return null;

  if (subscriber.startsWith(meta.dialCode)) {
    return normalizePhone(`+${subscriber}`);
  }

  return normalizePhone(`+${meta.dialCode}${subscriber}`);
}
