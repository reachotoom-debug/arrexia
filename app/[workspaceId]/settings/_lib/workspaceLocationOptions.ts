import type { TimezoneOption } from "@/lib/timezones";

/**
 * Curated country names for the workspace profile select. Values are stored as plain text
 * in the DB; unknown saved values are still shown as an extra "saved" option in the form.
 */
export const WORKSPACE_COUNTRY_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "Australia", label: "Australia" },
  { value: "Bahrain", label: "Bahrain" },
  { value: "Canada", label: "Canada" },
  { value: "Jordan", label: "Jordan" },
  { value: "Kuwait", label: "Kuwait" },
  { value: "Oman", label: "Oman" },
  { value: "Qatar", label: "Qatar" },
  { value: "Saudi Arabia", label: "Saudi Arabia" },
  { value: "United Arab Emirates", label: "United Arab Emirates" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "United States", label: "United States" },
].sort((a, b) => a.label.localeCompare(b.label));

/** IANA ids shown in Settings (subset of global list; saved custom values still supported). */
export const WORKSPACE_TIMEZONE_SELECT_ORDER = [
  "Asia/Amman",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
] as const;

export function buildCountrySelectOptions(savedCountry: string | null | undefined) {
  const saved = savedCountry?.trim() ?? "";
  const base = [...WORKSPACE_COUNTRY_SELECT_OPTIONS];
  if (saved && !base.some((c) => c.value === saved)) {
    base.push({ value: saved, label: `${saved} (saved)` });
  }
  return base;
}

export function buildTimezoneSelectOptions(
  allTimezones: TimezoneOption[],
  savedTimezone: string | null | undefined
) {
  const saved = savedTimezone?.trim() ?? "";
  const byValue = new Map(allTimezones.map((o) => [o.value, o] as const));
  const list: TimezoneOption[] = WORKSPACE_TIMEZONE_SELECT_ORDER.map((id) => {
    return byValue.get(id) ?? { value: id, label: id };
  });
  if (saved && !list.some((o) => o.value === saved)) {
    list.push({ value: saved, label: `${saved} (saved)` });
  }
  return list;
}
