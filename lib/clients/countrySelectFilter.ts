import { countries, type Country } from "@/lib/utils/countries";

export function buildCountryOptions(savedCountry: string): Country[] {
  const saved = savedCountry.trim();
  if (!saved || countries.some((c) => c.name === saved)) {
    return countries;
  }
  return [
    ...countries,
    { code: "XX", name: saved, flag: "🏳️", dialCode: "" },
  ];
}

export function filterCountries(options: Country[], query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;

  const digits = q.replace(/\D/g, "");
  return options.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (digits.length > 0 && c.dialCode.includes(digits))
  );
}

export function countryLabel(country: Country): string {
  const dial = country.dialCode ? ` (+${country.dialCode})` : "";
  return `${country.flag} ${country.name}${dial}`;
}
