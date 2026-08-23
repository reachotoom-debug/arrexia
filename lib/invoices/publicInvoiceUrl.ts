import { buildAppUrl, getConfiguredAppUrl } from "@/lib/config/appUrl";

/** Minimum entropy: 24 bytes base64url ≈ 32 chars, 128 bits. */
export const PUBLIC_INVOICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,48}$/;

export function isValidPublicInvoiceTokenFormat(token: string): boolean {
  return PUBLIC_INVOICE_TOKEN_PATTERN.test(token);
}

export function buildPublicInvoiceUrl(token: string): string {
  return buildAppUrl(`/i/${token}`);
}

/** Returns true when url is a canonical public invoice link for this app origin. */
export function isPublicInvoiceUrl(url: string): boolean {
  const normalized = url.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    const base = getConfiguredAppUrl();
    const baseParsed = new URL(base);
    if (parsed.origin !== baseParsed.origin) {
      return false;
    }
    const match = parsed.pathname.match(/^\/i\/([A-Za-z0-9_-]{32,48})$/);
    return Boolean(match?.[1]);
  } catch {
    return false;
  }
}

export function extractPublicInvoiceTokenFromUrl(url: string): string | null {
  if (!isPublicInvoiceUrl(url)) return null;
  try {
    const parsed = new URL(url.trim());
    const segment = parsed.pathname.split("/").filter(Boolean);
    if (segment.length !== 2 || segment[0] !== "i") return null;
    return segment[1] ?? null;
  } catch {
    return null;
  }
}
