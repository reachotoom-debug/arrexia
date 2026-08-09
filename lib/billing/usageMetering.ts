import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  TRIAL_USAGE_LIMITS,
  type TrialUsageResource,
} from "./trialConfig";

export type EntitlementUsageSnapshot = {
  workspace_id: string;
  trial_invoices_created: number;
  ai_generations_successful: number;
  automated_reminders_sent: number;
  manual_email_reminders_sent: number;
};

export type TryConsumeEntitlementResult =
  | { ok: true; usage: EntitlementUsageSnapshot }
  | { ok: false; reason: "limit_reached"; resource: TrialUsageResource; limit: number };

const EMPTY_USAGE: EntitlementUsageSnapshot = {
  workspace_id: "",
  trial_invoices_created: 0,
  ai_generations_successful: 0,
  automated_reminders_sent: 0,
  manual_email_reminders_sent: 0,
};

function mapUsageRow(
  workspaceId: string,
  row: Record<string, unknown> | null
): EntitlementUsageSnapshot {
  if (!row) {
    return { ...EMPTY_USAGE, workspace_id: workspaceId };
  }
  return {
    workspace_id: workspaceId,
    trial_invoices_created: Number(row.trial_invoices_created ?? 0),
    ai_generations_successful: Number(row.ai_generations_successful ?? 0),
    automated_reminders_sent: Number(row.automated_reminders_sent ?? 0),
    manual_email_reminders_sent: Number(row.manual_email_reminders_sent ?? 0),
  };
}

function readUsageCount(
  usage: EntitlementUsageSnapshot,
  resource: TrialUsageResource
): number {
  switch (resource) {
    case "trial_invoices":
      return usage.trial_invoices_created;
    case "ai_generations":
      return usage.ai_generations_successful;
    case "automated_reminders":
      return usage.automated_reminders_sent;
    case "manual_email_reminders":
      return usage.manual_email_reminders_sent;
    default:
      return 0;
  }
}

export async function loadEntitlementUsage(
  workspaceId: string,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "from"> = supabaseAdmin()
): Promise<EntitlementUsageSnapshot> {
  const { data, error } = await admin
    .from("workspace_entitlement_usage")
    .select(
      "workspace_id, trial_invoices_created, ai_generations_successful, automated_reminders_sent, manual_email_reminders_sent"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { ...EMPTY_USAGE, workspace_id: workspaceId };
    }
    throw new Error(`Failed to load entitlement usage: ${error.message}`);
  }

  return mapUsageRow(workspaceId, data as Record<string, unknown> | null);
}

export function getRemainingTrialUsage(
  usage: EntitlementUsageSnapshot,
  resource: TrialUsageResource
): number {
  const limit = TRIAL_USAGE_LIMITS[resource];
  return Math.max(0, limit - readUsageCount(usage, resource));
}

export function isTrialUsageExhausted(
  usage: EntitlementUsageSnapshot,
  resource: TrialUsageResource
): boolean {
  return getRemainingTrialUsage(usage, resource) <= 0;
}

/** Authoritative quota consume — limit check and increment are atomic in Postgres. */
export async function tryConsumeEntitlementUsage(
  workspaceId: string,
  resource: TrialUsageResource,
  amount = 1,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "rpc"> = supabaseAdmin()
): Promise<TryConsumeEntitlementResult> {
  const { data, error } = await admin.rpc("rpc_try_consume_entitlement_usage", {
    p_workspace_id: workspaceId,
    p_resource: resource,
    p_amount: amount,
  });

  if (error) {
    throw new Error(`Failed to consume entitlement usage: ${error.message}`);
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      reason: "limit_reached",
      resource,
      limit: TRIAL_USAGE_LIMITS[resource],
    };
  }

  return { ok: true, usage: mapUsageRow(workspaceId, payload) };
}

export type EntitlementReservationResult =
  | { ok: true; reservationId: string; state: "reserved" | "consumed" | "released"; idempotent: boolean }
  | { ok: false; reason: "limit_reached"; resource: TrialUsageResource; limit: number };

/** Idempotent reserve by reservation_id — safe for retries of the same logical operation. */
export async function reserveEntitlementUsage(
  workspaceId: string,
  resource: TrialUsageResource,
  reservationId: string,
  amount = 1,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "rpc"> = supabaseAdmin()
): Promise<EntitlementReservationResult> {
  const { data, error } = await admin.rpc("rpc_reserve_entitlement_usage", {
    p_workspace_id: workspaceId,
    p_resource: resource,
    p_amount: amount,
    p_reservation_id: reservationId,
  });

  if (error) {
    throw new Error(`Failed to reserve entitlement usage: ${error.message}`);
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      reason: "limit_reached",
      resource,
      limit: TRIAL_USAGE_LIMITS[resource],
    };
  }

  return {
    ok: true,
    reservationId,
    state: (payload.state as "reserved" | "consumed" | "released") ?? "reserved",
    idempotent: payload.idempotent === true,
  };
}

/** Marks a reserved slot consumed after successful operation (idempotent). */
export async function finalizeEntitlementUsage(
  workspaceId: string,
  reservationId: string,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "rpc"> = supabaseAdmin()
): Promise<void> {
  const { error } = await admin.rpc("rpc_finalize_entitlement_usage", {
    p_workspace_id: workspaceId,
    p_reservation_id: reservationId,
  });

  if (error) {
    throw new Error(`Failed to finalize entitlement usage: ${error.message}`);
  }
}

/** Release a prior reservation after a failed operation (idempotent by reservation_id). */
export async function releaseEntitlementUsage(
  workspaceId: string,
  resource: TrialUsageResource,
  reservationId: string,
  amount = 1,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "rpc"> = supabaseAdmin()
): Promise<void> {
  const { error } = await admin.rpc("rpc_release_entitlement_usage", {
    p_workspace_id: workspaceId,
    p_resource: resource,
    p_amount: amount,
    p_reservation_id: reservationId,
  });

  if (error) {
    throw new Error(`Failed to release entitlement usage: ${error.message}`);
  }
}

/** @deprecated Prefer tryConsumeEntitlementUsage for trial quotas. */
export async function incrementEntitlementUsage(
  workspaceId: string,
  resource: TrialUsageResource,
  amount = 1,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "rpc"> = supabaseAdmin()
): Promise<EntitlementUsageSnapshot> {
  const result = await tryConsumeEntitlementUsage(workspaceId, resource, amount, admin);
  if (!result.ok) {
    throw new Error(`Entitlement limit reached for ${resource}`);
  }
  return result.usage;
}

export async function assertTrialUsageAvailable(
  workspaceId: string,
  resource: TrialUsageResource,
  amount = 1
): Promise<EntitlementUsageSnapshot> {
  const usage = await loadEntitlementUsage(workspaceId);
  const remaining = getRemainingTrialUsage(usage, resource);
  if (remaining < amount) {
    return usage;
  }
  return usage;
}
