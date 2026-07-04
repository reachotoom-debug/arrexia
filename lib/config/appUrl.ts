import { sanitizeNextPath } from "@/lib/auth/safeNextPath";

const DEFAULT_LOCAL_APP_URL = "http://localhost:3000";
const DEFAULT_PRODUCTION_APP_URL = "https://arrexia.app";

/** Configured public app base URL (no trailing slash). */
export function getConfiguredAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return DEFAULT_LOCAL_APP_URL;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return DEFAULT_PRODUCTION_APP_URL;
}

/** Browser origin when available; otherwise configured app URL. */
export function getClientAppOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  return getConfiguredAppUrl();
}

/** Request origin when available; otherwise configured app URL. */
export function getServerAppOrigin(request?: Request): string {
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // fall through
    }
  }

  return getConfiguredAppUrl();
}

export function buildAppUrl(path: string, request?: Request): string {
  const base = getServerAppOrigin(request).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export type AuthCallbackUrlOptions = {
  origin?: string;
  next?: string | null;
  returnTo?: "/login" | "/register";
};

/** Supabase email/OAuth redirect target for this app. */
export function buildAuthCallbackUrl(options: AuthCallbackUrlOptions = {}): string | undefined {
  const base = (options.origin?.trim() || getClientAppOrigin()).replace(/\/+$/, "");
  if (!base) return undefined;

  const url = new URL("/auth/callback", base);

  const safeNext = sanitizeNextPath(options.next);
  if (safeNext) {
    url.searchParams.set("next", safeNext);
  }

  if (options.returnTo) {
    url.searchParams.set("returnTo", options.returnTo);
  }

  return url.toString();
}
