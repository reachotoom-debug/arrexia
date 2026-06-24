const DEFAULT_ADMIN_PATH = "/admin";

/** Server-side admin route prefix. Override with ADMIN_PATH=/founder-console in production. */
export function getAdminBasePath(): string {
  const configured = process.env.ADMIN_PATH?.trim();
  if (!configured) return DEFAULT_ADMIN_PATH;
  if (!configured.startsWith("/")) return `/${configured}`;
  return configured.replace(/\/+$/, "") || DEFAULT_ADMIN_PATH;
}

/** Client-safe admin route prefix (mirrors ADMIN_PATH at build time). */
export function getPublicAdminBasePath(): string {
  const configured = process.env.NEXT_PUBLIC_ADMIN_PATH?.trim();
  if (!configured) return getAdminBasePath();
  if (!configured.startsWith("/")) return `/${configured}`;
  return configured.replace(/\/+$/, "") || DEFAULT_ADMIN_PATH;
}

export function getAdminPath(subpath = ""): string {
  const base = getAdminBasePath();
  if (!subpath) return base;
  const normalized = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${base}${normalized}`;
}

export function getAdminLoginRedirectUrl(): string {
  return `/login?next=${encodeURIComponent(getAdminBasePath())}`;
}

export function isAdminRequestPath(pathname: string): boolean {
  const base = getAdminBasePath();
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isAdminSecurityPath(pathname: string): boolean {
  return pathname === getAdminPath("/security");
}

export const FOUNDER_ADMIN_MIGRATION_FILE =
  "supabase/migrations/20260622130000_founder_admin_console.sql";

export function getAdminRevalidatePaths(): string[] {
  const base = getAdminBasePath();
  return [
    base,
    `${base}/users`,
    `${base}/subscribers`,
    `${base}/revenue`,
    `${base}/renewals`,
    `${base}/email-ops`,
    `${base}/product-usage`,
    `${base}/notifications`,
    `${base}/security`,
    `${base}/settings`,
    "/admin",
    "/admin/users",
    "/admin/subscribers",
    "/admin/revenue",
    "/admin/renewals",
    "/admin/email-ops",
    "/admin/product-usage",
    "/admin/notifications",
    "/admin/security",
    "/admin/settings",
  ];
}
