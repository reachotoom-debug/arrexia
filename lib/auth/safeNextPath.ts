import { isAdminRequestPath } from "@/lib/admin/adminPaths";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject external or protocol-relative redirects. */
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;

  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://") || trimmed.includes("\\")) return null;

  return trimmed;
}

/**
 * Returns a safe post-login path to honor, or null to use the workspace dashboard default.
 */
export function resolveHonoredNextPath(
  next: string | null | undefined,
  memberWorkspaceIds: Iterable<string>
): string | null {
  const safe = sanitizeNextPath(next);
  if (!safe) return null;

  const pathname = safe.split(/[?#]/)[0] ?? safe;
  const allowedWorkspaces = new Set(memberWorkspaceIds);

  if (isAdminRequestPath(pathname)) {
    return safe;
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (!firstSegment || !UUID_RE.test(firstSegment)) {
    return null;
  }

  if (!allowedWorkspaces.has(firstSegment)) {
    return null;
  }

  return safe;
}
