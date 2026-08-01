import "server-only";

import { PUBLIC_ARREXIA_EMAIL_ADDRESSES } from "@/lib/email/publicAddresses";

/** Full mailbox map including internal routing addresses (server-only). */
export const ARREXIA_EMAIL_ADDRESSES = {
  ...PUBLIC_ARREXIA_EMAIL_ADDRESSES,
  billing: "billing@arrexia.app",
  collections: "collections@arrexia.app",
} as const;

export type ArrexiaMailboxKey = keyof typeof ARREXIA_EMAIL_ADDRESSES;

export {
  DEFAULT_TRANSACTIONAL_FROM,
  containsEmailHeaderInjection,
  parseEmailSenderAddress,
  parseEmailSenderDisplay,
  sanitizeReplyToAddress,
  validateFormattedFromIdentity,
  validatePlainEmailAddress,
} from "@/lib/email/emailValidation";
