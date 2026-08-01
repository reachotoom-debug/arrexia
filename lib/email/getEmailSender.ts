import "server-only";

import {
  DEFAULT_TRANSACTIONAL_FROM,
  parseEmailSenderAddress,
  parseEmailSenderDisplay,
  validateFormattedFromIdentity,
} from "@/lib/email/addresses";
import { SANDBOX_FROM_EMAIL, normalizeEmailAddress } from "@/lib/email/constants";
import {
  getTransactionalFrom,
  resolveTransactionalFromIdentity,
} from "@/lib/email/identityConfig";

export { DEFAULT_TRANSACTIONAL_FROM as DEFAULT_EMAIL_SENDER };

export const EMAIL_SENDER_MISCONFIGURED_MESSAGE =
  "Email sender is not configured correctly.";

/** Resend sender — always from central identity config, never workspace settings. */
export function getEmailSender(): string {
  return getTransactionalFrom();
}

export {
  parseEmailSenderAddress,
  parseEmailSenderDisplay,
  validateFormattedFromIdentity as validateEmailSender,
} from "@/lib/email/addresses";

export function logEmailSenderDev(from: string): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[email] Resend from:", from);
}

export function resolveResendSender():
  | { ok: true; from: string }
  | { ok: false; error: string } {
  const resolved = resolveTransactionalFromIdentity();
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return { ok: true, from: resolved.from };
}

export function isSandboxEmailSenderActive(): boolean {
  const email = parseEmailSenderAddress(getEmailSender());
  if (!email) {
    return false;
  }

  return normalizeEmailAddress(email) === normalizeEmailAddress(SANDBOX_FROM_EMAIL);
}
