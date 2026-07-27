import { getCountryByCode, getCountryByName } from "@/lib/utils/countries";

export type CountryPhoneMetadata = {
  dialCode: string;
  trunkPrefix: string | null;
};

/**
 * Resolve dialing metadata from a client country value (ISO code or country name).
 * Uses the shared `lib/utils/countries` catalog only — never workspace or browser locale.
 */
export function resolveCountryPhoneMetadata(
  countryInput: string | null | undefined
): CountryPhoneMetadata | null {
  if (!countryInput?.trim()) return null;

  const trimmed = countryInput.trim();
  const byName = getCountryByName(trimmed);
  if (byName?.dialCode) {
    return {
      dialCode: byName.dialCode,
      trunkPrefix: byName.trunkPrefix ?? null,
    };
  }

  const byCode = getCountryByCode(trimmed.toUpperCase());
  if (byCode?.dialCode) {
    return {
      dialCode: byCode.dialCode,
      trunkPrefix: byCode.trunkPrefix ?? null,
    };
  }

  return null;
}
