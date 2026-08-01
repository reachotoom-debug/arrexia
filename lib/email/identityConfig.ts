import "server-only";

import {
  DEFAULT_TRANSACTIONAL_FROM,
  sanitizeReplyToAddress,
  validateFormattedFromIdentity,
  validatePlainEmailAddress,
} from "@/lib/email/emailValidation";
import { ARREXIA_EMAIL_ADDRESSES } from "@/lib/email/addresses";

export type EmailIdentityCategory =
  | "transactional"
  | "auth"
  | "invoice"
  | "reminder"
  | "billing"
  | "general"
  | "support"
  | "collections"
  | "sales"
  | "newsletter";

export type ResolvedEmailIdentity = {
  from: string;
  replyTo: string;
  internalRecipient: string;
};

type EmailConfigEnv = Record<string, string | undefined>;

const ENV_FROM_KEYS = ["ARREXIA_EMAIL_FROM", "EMAIL_FROM"] as const;

const REPLY_TO_ENV = {
  auth: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_SUPPORT",
    fallback: ARREXIA_EMAIL_ADDRESSES.support,
  },
  general: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_GENERAL",
    fallback: ARREXIA_EMAIL_ADDRESSES.hello,
  },
  support: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_SUPPORT",
    fallback: ARREXIA_EMAIL_ADDRESSES.support,
  },
  billing: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_BILLING",
    fallback: ARREXIA_EMAIL_ADDRESSES.billing,
  },
  collections: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_COLLECTIONS",
    fallback: ARREXIA_EMAIL_ADDRESSES.collections,
  },
  sales: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_SALES",
    fallback: ARREXIA_EMAIL_ADDRESSES.sales,
  },
  newsletter: {
    envKey: "ARREXIA_EMAIL_REPLY_TO_GENERAL",
    fallback: ARREXIA_EMAIL_ADDRESSES.hello,
  },
} as const;

const INTERNAL_TO_ENV = {
  general: {
    envKey: "ARREXIA_EMAIL_TO_GENERAL",
    fallback: ARREXIA_EMAIL_ADDRESSES.hello,
  },
  support: {
    envKey: "ARREXIA_EMAIL_TO_SUPPORT",
    fallback: ARREXIA_EMAIL_ADDRESSES.support,
  },
  billing: {
    envKey: "ARREXIA_EMAIL_TO_BILLING",
    fallback: ARREXIA_EMAIL_ADDRESSES.billing,
  },
  collections: {
    envKey: "ARREXIA_EMAIL_TO_COLLECTIONS",
    fallback: ARREXIA_EMAIL_ADDRESSES.collections,
  },
  sales: {
    envKey: "ARREXIA_EMAIL_TO_SALES",
    fallback: ARREXIA_EMAIL_ADDRESSES.sales,
  },
} as const;

type ReplyToCategory = keyof typeof REPLY_TO_ENV;
type InternalRecipientCategory = keyof typeof INTERNAL_TO_ENV;

export function isProductionEnvironment(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  return nodeEnv === "production";
}

function readEnvAddress(
  env: EmailConfigEnv,
  envKey: string
): string | undefined {
  const value = env[envKey]?.trim();
  return value || undefined;
}

function resolveConfiguredAddress(
  env: EmailConfigEnv,
  envKey: string,
  fallback: string,
  label: string,
  production: boolean
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = readEnvAddress(env, envKey) ?? fallback;
  if (!validatePlainEmailAddress(raw)) {
    return {
      ok: false,
      error: `${label} is not a valid email address.`,
    };
  }
  if (production && readEnvAddress(env, envKey) == null && raw !== fallback) {
    return { ok: true, value: raw };
  }
  return { ok: true, value: raw };
}

export function resolveTransactionalFromIdentity(
  env: EmailConfigEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV
):
  | { ok: true; from: string }
  | { ok: false; error: string } {
  let rawFrom: string | undefined;
  for (const key of ENV_FROM_KEYS) {
    const value = readEnvAddress(env, key);
    if (value) {
      rawFrom = value;
      break;
    }
  }

  const from = rawFrom ?? DEFAULT_TRANSACTIONAL_FROM;

  if (!validateFormattedFromIdentity(from)) {
    return {
      ok: false,
      error: "Email sender is not configured correctly.",
    };
  }

  if (isProductionEnvironment(nodeEnv) && !rawFrom) {
    return {
      ok: false,
      error:
        "ARREXIA_EMAIL_FROM or EMAIL_FROM must be set in production.",
    };
  }

  return { ok: true, from };
}

export function getTransactionalFrom(
  env: EmailConfigEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const resolved = resolveTransactionalFromIdentity(env, nodeEnv);
  if (!resolved.ok) {
    if (isProductionEnvironment(nodeEnv)) {
      throw new Error(resolved.error);
    }
    return DEFAULT_TRANSACTIONAL_FROM;
  }
  return resolved.from;
}

function resolveReplyTo(
  category: ReplyToCategory,
  env: EmailConfigEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const config = REPLY_TO_ENV[category];
  const resolved = resolveConfiguredAddress(
    env,
    config.envKey,
    config.fallback,
    config.envKey,
    isProductionEnvironment(nodeEnv)
  );
  if (!resolved.ok) {
    if (isProductionEnvironment(nodeEnv)) {
      throw new Error(resolved.error);
    }
    return config.fallback;
  }
  return resolved.value;
}

export function getInternalRecipient(
  category: InternalRecipientCategory,
  env: EmailConfigEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const config = INTERNAL_TO_ENV[category];
  const resolved = resolveConfiguredAddress(
    env,
    config.envKey,
    config.fallback,
    config.envKey,
    isProductionEnvironment(nodeEnv)
  );
  if (!resolved.ok) {
    if (isProductionEnvironment(nodeEnv)) {
      throw new Error(resolved.error);
    }
    return config.fallback;
  }
  return resolved.value;
}

export function getEmailIdentity(
  category: EmailIdentityCategory,
  env: EmailConfigEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV
): ResolvedEmailIdentity {
  const from = getTransactionalFrom(env, nodeEnv);

  switch (category) {
    case "transactional":
      return {
        from,
        replyTo: resolveReplyTo("general", env, nodeEnv),
        internalRecipient: getInternalRecipient("general", env, nodeEnv),
      };
    case "auth":
      return {
        from,
        replyTo: resolveReplyTo("auth", env, nodeEnv),
        internalRecipient: getInternalRecipient("support", env, nodeEnv),
      };
    case "invoice":
    case "billing":
      return {
        from,
        replyTo: resolveReplyTo("billing", env, nodeEnv),
        internalRecipient: getInternalRecipient("billing", env, nodeEnv),
      };
    case "reminder":
    case "collections":
      return {
        from,
        replyTo: resolveReplyTo("collections", env, nodeEnv),
        internalRecipient: getInternalRecipient("collections", env, nodeEnv),
      };
    case "general":
      return {
        from,
        replyTo: resolveReplyTo("general", env, nodeEnv),
        internalRecipient: getInternalRecipient("general", env, nodeEnv),
      };
    case "support":
      return {
        from,
        replyTo: resolveReplyTo("support", env, nodeEnv),
        internalRecipient: getInternalRecipient("support", env, nodeEnv),
      };
    case "sales":
      return {
        from,
        replyTo: resolveReplyTo("sales", env, nodeEnv),
        internalRecipient: getInternalRecipient("sales", env, nodeEnv),
      };
    case "newsletter":
      return {
        from,
        replyTo: resolveReplyTo("newsletter", env, nodeEnv),
        internalRecipient: getInternalRecipient("general", env, nodeEnv),
      };
    default:
      return {
        from,
        replyTo: resolveReplyTo("general", env, nodeEnv),
        internalRecipient: getInternalRecipient("general", env, nodeEnv),
      };
  }
}

export function resolveSubmitterReplyTo(
  submitterEmail: string
): { ok: true; replyTo: string } | { ok: false; error: string } {
  const sanitized = sanitizeReplyToAddress(submitterEmail);
  if (!sanitized) {
    return { ok: false, error: "Invalid submitter email address." };
  }
  return { ok: true, replyTo: sanitized };
}
