export type SettingsSectionId =
  | "workspace"
  | "branding"
  | "email"
  | "reminders"
  | "billing"
  | "account";

/** Overview/home grid when no section is selected */
export type SettingsViewId = SettingsSectionId | "overview";

function readParam(
  sp: Record<string, string | string[] | undefined> | URLSearchParams,
  key: string
): string | undefined {
  if (sp instanceof URLSearchParams) {
    return sp.get(key) ?? undefined;
  }
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Resolves settings view from `section` or legacy `tab`.
 * Bare `/settings` → overview (card grid). Explicit `section=workspace` etc. → that section.
 */
export function resolveSettingsSection(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): SettingsViewId {
  const section = readParam(sp, "section");
  if (section === "overview") return "overview";
  if (
    section === "workspace" ||
    section === "branding" ||
    section === "email" ||
    section === "reminders" ||
    section === "billing" ||
    section === "account"
  ) {
    return section;
  }

  const tab = readParam(sp, "tab");
  if (tab === "billing") return "billing";
  if (tab === "payments" || tab === "branding") return "branding";
  if (tab === "reminders") return "reminders";
  if (tab === "email") return "email";
  if (tab === "account") return "account";

  return "overview";
}
