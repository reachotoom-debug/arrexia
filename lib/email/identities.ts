import "server-only";

export {
  getEmailIdentity,
  getInternalRecipient,
  getTransactionalFrom,
  resolveSubmitterReplyTo,
  resolveTransactionalFromIdentity,
  type EmailIdentityCategory,
  type ResolvedEmailIdentity,
} from "@/lib/email/identityConfig";

export {
  ARREXIA_EMAIL_ADDRESSES,
  DEFAULT_TRANSACTIONAL_FROM,
  sanitizeReplyToAddress,
  validatePlainEmailAddress,
  validateFormattedFromIdentity,
} from "@/lib/email/addresses";

import {
  getEmailIdentity,
  getInternalRecipient,
  getTransactionalFrom,
} from "@/lib/email/identityConfig";

export const EMAIL_IDENTITIES = {
  get transactionalFrom() {
    return getTransactionalFrom();
  },
  auth: {
    get replyTo() {
      return getEmailIdentity("auth").replyTo;
    },
  },
  general: {
    get replyTo() {
      return getEmailIdentity("general").replyTo;
    },
    get internalRecipient() {
      return getInternalRecipient("general");
    },
  },
  support: {
    get replyTo() {
      return getEmailIdentity("support").replyTo;
    },
    get internalRecipient() {
      return getInternalRecipient("support");
    },
  },
  billing: {
    get replyTo() {
      return getEmailIdentity("billing").replyTo;
    },
    get internalRecipient() {
      return getInternalRecipient("billing");
    },
  },
  collections: {
    get replyTo() {
      return getEmailIdentity("collections").replyTo;
    },
    get internalRecipient() {
      return getInternalRecipient("collections");
    },
  },
  sales: {
    get replyTo() {
      return getEmailIdentity("sales").replyTo;
    },
    get internalRecipient() {
      return getInternalRecipient("sales");
    },
  },
} as const;
