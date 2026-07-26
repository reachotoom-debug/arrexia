import { supabaseAdmin } from "@/lib/supabase/admin";

export const ACCOUNT_ACTIVATION_METHODS = [
  "email_signup",
  "oauth",
  "legacy_backfill",
] as const;

export type AccountActivationMethod = (typeof ACCOUNT_ACTIVATION_METHODS)[number];

export type ActivateAccountResult =
  | { ok: true; created: boolean; activatedAt: string; method: AccountActivationMethod }
  | { ok: false; reason: "invalid_method" | "write_failed" };

export type AccountActivationLookupResult =
  | { ok: true; activated: boolean; activatedAt?: string; method?: AccountActivationMethod }
  | { ok: false; reason: "lookup_failed" };

const ACTIVATION_METHOD_SET = new Set<string>(ACCOUNT_ACTIVATION_METHODS);

export function isValidActivationMethod(value: string): value is AccountActivationMethod {
  return ACTIVATION_METHOD_SET.has(value);
}

export async function isAccountActivated(userId: string): Promise<boolean> {
  const lookup = await lookupAccountActivation(userId);
  return lookup.ok && lookup.activated;
}

export async function lookupAccountActivation(
  userId: string
): Promise<AccountActivationLookupResult> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("user_account_activation")
      .select("activated_at, activation_method")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "lookup_failed" };
    }

    if (!data) {
      return { ok: true, activated: false };
    }

    const method = data.activation_method;
    if (!isValidActivationMethod(method)) {
      return { ok: false, reason: "lookup_failed" };
    }

    return {
      ok: true,
      activated: true,
      activatedAt: data.activated_at,
      method,
    };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

/**
 * Idempotent activation write. Never updates an existing row (preserves first activation).
 */
export async function activateAccount(
  userId: string,
  method: AccountActivationMethod
): Promise<ActivateAccountResult> {
  if (!isValidActivationMethod(method)) {
    return { ok: false, reason: "invalid_method" };
  }

  try {
    const admin = supabaseAdmin();
    const existing = await lookupAccountActivation(userId);

    if (!existing.ok) {
      return { ok: false, reason: "write_failed" };
    }

    if (existing.activated && existing.activatedAt && existing.method) {
      return {
        ok: true,
        created: false,
        activatedAt: existing.activatedAt,
        method: existing.method,
      };
    }

    const activatedAt = new Date().toISOString();
    const { error } = await admin.from("user_account_activation").insert({
      user_id: userId,
      activation_method: method,
      activated_at: activatedAt,
    });

    if (error) {
      if (error.code === "23505") {
        const raced = await lookupAccountActivation(userId);
        if (raced.ok && raced.activated && raced.activatedAt && raced.method) {
          return {
            ok: true,
            created: false,
            activatedAt: raced.activatedAt,
            method: raced.method,
          };
        }
      }

      return { ok: false, reason: "write_failed" };
    }

    return { ok: true, created: true, activatedAt, method };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}

export type BootstrapActivationDecision =
  | { allowed: true }
  | { allowed: false; reason: "not_activated" | "lookup_failed" };

/**
 * Fail closed for new workspace bootstrap. Existing workspace members may proceed
 * and receive a runtime legacy_backfill safety net when migration missed them.
 */
export async function assertBootstrapActivationAllowed(
  userId: string,
  hasExistingWorkspaceMembership: boolean
): Promise<BootstrapActivationDecision> {
  const lookup = await lookupAccountActivation(userId);

  if (!lookup.ok) {
    return { allowed: false, reason: "lookup_failed" };
  }

  if (lookup.activated) {
    return { allowed: true };
  }

  if (hasExistingWorkspaceMembership) {
    const backfill = await activateAccount(userId, "legacy_backfill");
    if (backfill.ok) {
      return { allowed: true };
    }
    return { allowed: false, reason: "lookup_failed" };
  }

  return { allowed: false, reason: "not_activated" };
}

export async function lookupAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc("lookup_auth_user_id_by_email", {
      p_email: normalized,
    });

    if (error || !data) {
      return null;
    }

    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}
