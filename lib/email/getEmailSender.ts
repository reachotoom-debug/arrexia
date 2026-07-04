import "server-only";

import { SANDBOX_FROM_EMAIL, normalizeEmailAddress } from "@/lib/email/constants";

export const DEFAULT_EMAIL_SENDER = "Arrexia <noreply@arrexia.app>";

export const EMAIL_SENDER_MISCONFIGURED_MESSAGE =
  "Email sender is not configured correctly.";

const PLAIN_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_EMAIL_RE = /^([^<>\n]+?)<\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*>$/;

/** Resend sender — always from EMAIL_FROM env, never workspace settings. */
export function getEmailSender(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_SENDER;
}

export function parseEmailSenderAddress(from: string): string | null {
  const trimmed = from.trim();
  if (!trimmed) {
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

export function validateEmailSender(from: string): boolean {
  return parseEmailSenderAddress(from) !== null;
}

export function logEmailSenderDev(from: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[email] Resend from:", from);
}

export function resolveResendSender():
  | { ok: true; from: string }
  | { ok: false; error: string } {
  const from = getEmailSender();
  if (!validateEmailSender(from)) {
    return { ok: false, error: EMAIL_SENDER_MISCONFIGURED_MESSAGE };
  }

  return { ok: true, from };
}

export function isSandboxEmailSenderActive(): boolean {
  const email = parseEmailSenderAddress(getEmailSender());
  if (!email) {
    return false;
  }

  return normalizeEmailAddress(email) === normalizeEmailAddress(SANDBOX_FROM_EMAIL);
}
