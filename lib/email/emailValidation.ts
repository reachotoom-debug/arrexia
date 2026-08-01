import { PUBLIC_ARREXIA_EMAIL_ADDRESSES } from "@/lib/email/publicAddresses";

export const DEFAULT_TRANSACTIONAL_FROM = `Arrexia <${PUBLIC_ARREXIA_EMAIL_ADDRESSES.hello}>`;

export const PLAIN_EMAIL_RE = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
export const NAMED_EMAIL_RE =
  /^([^<>\r\n]+?)<\s*([^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+)\s*>$/;

export function containsEmailHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

export function validatePlainEmailAddress(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || containsEmailHeaderInjection(trimmed)) {
    return false;
  }
  return PLAIN_EMAIL_RE.test(trimmed);
}

export function parseEmailSenderAddress(from: string): string | null {
  const trimmed = from.trim();
  if (!trimmed || containsEmailHeaderInjection(trimmed)) {
    return null;
  }

  const named = trimmed.match(NAMED_EMAIL_RE);
  if (named) {
    return named[2]!.trim();
  }

  if (PLAIN_EMAIL_RE.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function validateFormattedFromIdentity(from: string): boolean {
  return parseEmailSenderAddress(from) !== null;
}

export function parseEmailSenderDisplay(
  from: string
): { name: string; email: string } | null {
  const trimmed = from.trim();
  const email = parseEmailSenderAddress(trimmed);
  if (!email) {
    return null;
  }

  const named = trimmed.match(NAMED_EMAIL_RE);
  if (named) {
    const name = named[1]!.trim().replace(/^["']|["']$/g, "");
    return { name: name || "Arrexia", email };
  }

  return { name: "Arrexia", email };
}

export function sanitizeReplyToAddress(email: string): string | null {
  const trimmed = email.trim();
  if (!validatePlainEmailAddress(trimmed)) {
    return null;
  }
  return trimmed;
}
