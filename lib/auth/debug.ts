import { cookies, headers } from "next/headers";

/** Temporary auth gate logging for production debugging. */
export async function logAuthGate(
  gate: "requireUser" | "requireWorkspace",
  details: Record<string, unknown>
): Promise<void> {
  const cookieStore = await cookies();
  const h = await headers();
  const all = cookieStore.getAll();
  const authCookies = all.filter(
    (c) => c.name.includes("auth-token") || c.name.startsWith("sb-")
  );

  console.info(`[auth/${gate}]`, {
    pathname: h.get("next-url") ?? h.get("referer") ?? "unknown",
    cookiesPresent: all.length > 0,
    authCookiesPresent: authCookies.length > 0,
    authCookieNames: authCookies.map((c) => c.name),
    ...details,
  });
}
