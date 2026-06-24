import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const SENSITIVE_AUTH_PARAMS = ["password", "passwd", "pwd"] as const;
const POST_LOGIN_MAX_ATTEMPTS = 4;
const POST_LOGIN_RETRY_MS = 150;

export { sanitizeNextPath as sanitizeNextUrl } from "@/lib/auth/safeNextPath";

type PostLoginApiSuccess = {
  ok: true;
  redirectTo: string;
  workspaceFound?: boolean;
  workspaceCreated?: boolean;
};

type PostLoginApiFailure = {
  ok?: false;
  error?: string;
};

type PostLoginApiLegacy = {
  path?: string;
  redirectTo?: string;
  error?: string;
};

function parsePostLoginPayload(
  payload: PostLoginApiSuccess | PostLoginApiFailure | PostLoginApiLegacy | null,
  status: number
) {
  if (!payload) {
    return {
      redirectTo: null as string | null,
      error:
        status >= 500
          ? "Post-login service unavailable. Please try again."
          : "Invalid post-login response",
    };
  }

  if ("ok" in payload && payload.ok === true && payload.redirectTo) {
    return { redirectTo: payload.redirectTo, error: null as string | null };
  }

  if ("redirectTo" in payload && payload.redirectTo) {
    return { redirectTo: payload.redirectTo, error: null as string | null };
  }

  if ("path" in payload && payload.path) {
    return { redirectTo: payload.path, error: null as string | null };
  }

  return {
    redirectTo: null as string | null,
    error:
      ("error" in payload && payload.error) ||
      "Failed to resolve post-login destination",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolvePostLoginPath(
  nextUrl?: string | null
): Promise<{ redirectTo: string; error?: string }> {
  const params = new URLSearchParams();
  if (nextUrl) {
    params.set("next", nextUrl);
  }

  const query = params.toString();
  const url = `/api/auth/post-login${query ? `?${query}` : ""}`;

  let lastStatus = 0;
  let lastPayload: PostLoginApiSuccess | PostLoginApiFailure | null = null;
  let lastError = "Failed to resolve post-login destination";

  for (let attempt = 1; attempt <= POST_LOGIN_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
    });

    lastStatus = response.status;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      lastPayload = (await response.json().catch(() => null)) as
        | PostLoginApiSuccess
        | PostLoginApiFailure
        | PostLoginApiLegacy
        | null;
    } else {
      lastPayload = null;
    }

    const parsed = parsePostLoginPayload(lastPayload, response.status);

    if (process.env.NODE_ENV === "development") {
      console.info("[auth/post-login/client]", {
        attempt,
        statusCode: response.status,
        body: lastPayload,
        redirectTo: parsed.redirectTo,
      });
    }

    if (response.ok && parsed.redirectTo) {
      return { redirectTo: parsed.redirectTo };
    }

    lastError = parsed.error || lastError;

    if (response.status === 401 && attempt < POST_LOGIN_MAX_ATTEMPTS) {
      await delay(POST_LOGIN_RETRY_MS * attempt);
      continue;
    }

    break;
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[auth/post-login/client]", {
      failed: true,
      lastStatusCode: lastStatus,
      lastBody: lastPayload,
      error: lastError,
    });
  }

  return {
    redirectTo: "/login",
    error: lastError,
  };
}

/** Full navigation so middleware/RSC see refreshed auth cookies. */
export function completeAuthRedirect(router: AppRouterInstance, redirectTo: string) {
  if (process.env.NODE_ENV === "development") {
    console.info("[auth/login]", {
      windowLocationAssign: redirectTo,
    });
  }

  router.refresh();
  window.location.assign(redirectTo);
}

const OAUTH_ERROR_PARAMS = ["error", "error_description"] as const;

/**
 * Removes credential and OAuth error query params from the URL.
 * Never reads password values. Returns email when present for optional prefill.
 */
export function stripCredentialsFromAuthUrl(options?: {
  stripOAuthErrors?: boolean;
}): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  let dirty = false;

  for (const key of SENSITIVE_AUTH_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      dirty = true;
    }
  }

  let email: string | null = null;
  if (url.searchParams.has("email")) {
    email = url.searchParams.get("email");
    url.searchParams.delete("email");
    dirty = true;
  }

  if (options?.stripOAuthErrors) {
    for (const key of OAUTH_ERROR_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        dirty = true;
      }
    }
  }

  if (dirty) {
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return email;
}
