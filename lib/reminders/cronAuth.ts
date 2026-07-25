export type CronAuthFailure = {
  ok: false;
  status: 500 | 401;
  error: string;
};

export type CronAuthSuccess = { ok: true };

export type CronAuthResult = CronAuthSuccess | CronAuthFailure;

/**
 * Validates Vercel Cron (Authorization: Bearer) and legacy x-cron-secret callers.
 * Never logs the secret.
 */
export function verifyCronReminderAuth(headers: {
  get(name: string): string | null;
}): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "Server configuration error" };
  }

  const authHeader = headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const legacyHeader = headers.get("x-cron-secret");

  if (bearer === secret || legacyHeader === secret) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}
