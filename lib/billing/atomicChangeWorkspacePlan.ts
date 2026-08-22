import "server-only";

import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanStorageLimits, isWorkspacePlan, normalizeBillingInterval, type BillingInterval, type WorkspacePlan } from "./plans";
import { buildSubscriptionUpsertPayload } from "./subscriptionSyncPayload";
import type { SubscriptionSyncMode } from "./planMutationPolicy";
import type {
  WorkspaceSubscriptionSnapshot,
  WorkspaceSubscriptionStatus,
} from "./workspaceSubscription";

export const CUSTOMER_ATOMIC_ACTIVATION_FAILURE_MESSAGE =
  "We couldn't activate the selected plan. No billing changes were applied. Please try again or contact support.";

export type AtomicWorkspacePlanSnapshot = {
  workspace_id: string;
  stored_plan: WorkspacePlan;
  subscription_plan: WorkspacePlan;
  subscription_status: WorkspaceSubscriptionStatus;
  payment_provider: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  billing_interval?: string;
  plan_updated_at: string;
  subscription_updated_at: string;
};

export type AtomicWorkspacePlanChangeArgs = {
  workspaceId: string;
  targetPlan: WorkspacePlan;
  syncMode: SubscriptionSyncMode;
  existingSubscription: WorkspaceSubscriptionSnapshot | null;
  billingInterval?: BillingInterval;
  now?: Date;
};

export type AtomicWorkspacePlanChangeResult =
  | { ok: true; snapshot: AtomicWorkspacePlanSnapshot }
  | {
      ok: false;
      reason:
        | "missing_table"
        | "rpc_failed"
        | "invalid_snapshot"
        | "snapshot_mismatch"
        | "invalid_payload";
      error: string;
    };

type RpcAdmin = Pick<ReturnType<typeof supabaseAdmin>, "rpc">;

function parseIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function parseAtomicWorkspacePlanSnapshot(
  value: unknown
): AtomicWorkspacePlanSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const storedPlan = row.stored_plan;
  const subscriptionPlan = row.subscription_plan;
  const subscriptionStatus = row.subscription_status;

  if (
    typeof row.workspace_id !== "string" ||
    typeof storedPlan !== "string" ||
    typeof subscriptionPlan !== "string" ||
    !isWorkspacePlan(storedPlan) ||
    !isWorkspacePlan(subscriptionPlan) ||
    typeof subscriptionStatus !== "string"
  ) {
    return null;
  }

  return {
    workspace_id: row.workspace_id,
    stored_plan: storedPlan,
    subscription_plan: subscriptionPlan,
    subscription_status: subscriptionStatus as WorkspaceSubscriptionStatus,
    payment_provider: String(row.payment_provider ?? "manual"),
    trial_starts_at: parseIso(row.trial_starts_at),
    trial_ends_at: parseIso(row.trial_ends_at),
    current_period_starts_at: parseIso(row.current_period_starts_at),
    current_period_ends_at: parseIso(row.current_period_ends_at),
    cancel_at_period_end: parseBoolean(row.cancel_at_period_end),
    billing_interval: String(row.billing_interval ?? "monthly"),
    plan_updated_at: String(row.plan_updated_at ?? ""),
    subscription_updated_at: String(row.subscription_updated_at ?? ""),
  };
}

export function buildAtomicWorkspacePlanRpcParams(
  args: AtomicWorkspacePlanChangeArgs
): Record<string, unknown> | null {
  const now = args.now ?? new Date();
  const limits = getPlanStorageLimits(args.targetPlan);
  const subscriptionPayload = buildSubscriptionUpsertPayload(
    args.workspaceId,
    args.targetPlan,
    args.syncMode,
    args.existingSubscription,
    now,
    { billingInterval: args.billingInterval ?? normalizeBillingInterval(args.existingSubscription?.billingInterval) }
  );

  if (!subscriptionPayload) {
    return null;
  }

  return {
    p_workspace_id: args.workspaceId,
    p_target_plan: args.targetPlan,
    p_invoice_limit_monthly: limits.invoice_limit_monthly,
    p_client_limit: limits.client_limit,
    p_subscription_status: subscriptionPayload.status,
    p_subscription_plan: subscriptionPayload.plan,
    p_payment_provider: subscriptionPayload.payment_provider ?? "manual",
    p_trial_starts_at: subscriptionPayload.trial_starts_at ?? null,
    p_trial_ends_at: subscriptionPayload.trial_ends_at ?? null,
    p_current_period_starts_at: subscriptionPayload.current_period_starts_at ?? null,
    p_current_period_ends_at: subscriptionPayload.current_period_ends_at ?? null,
    p_cancel_at_period_end: subscriptionPayload.cancel_at_period_end ?? false,
    p_billing_interval: subscriptionPayload.billing_interval ?? "monthly",
  };
}

export function verifyAtomicWorkspacePlanSnapshot(
  snapshot: AtomicWorkspacePlanSnapshot,
  targetPlan: WorkspacePlan,
  expectedStatus: WorkspaceSubscriptionStatus
): boolean {
  return (
    snapshot.stored_plan === targetPlan &&
    snapshot.subscription_plan === targetPlan &&
    snapshot.subscription_status === expectedStatus
  );
}

export async function executeAtomicWorkspacePlanChange(
  args: AtomicWorkspacePlanChangeArgs,
  admin: RpcAdmin = supabaseAdmin()
): Promise<AtomicWorkspacePlanChangeResult> {
  const rpcParams = buildAtomicWorkspacePlanRpcParams(args);
  if (!rpcParams) {
    return {
      ok: false,
      reason: "invalid_payload",
      error: "Subscription payload could not be built for atomic mutation.",
    };
  }

  const expectedStatus = String(rpcParams.p_subscription_status) as WorkspaceSubscriptionStatus;

  const { data, error } = await admin.rpc(
    "rpc_change_workspace_plan_atomic",
    rpcParams
  );

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return {
        ok: false,
        reason: "missing_table",
        error: error.message,
      };
    }
    return {
      ok: false,
      reason: "rpc_failed",
      error: error.message,
    };
  }

  const snapshot = parseAtomicWorkspacePlanSnapshot(data);
  if (!snapshot) {
    return {
      ok: false,
      reason: "invalid_snapshot",
      error: "Atomic billing RPC returned an invalid snapshot.",
    };
  }

  if (!verifyAtomicWorkspacePlanSnapshot(snapshot, args.targetPlan, expectedStatus)) {
    return {
      ok: false,
      reason: "snapshot_mismatch",
      error: "Atomic billing RPC snapshot did not match the requested mutation.",
    };
  }

  return { ok: true, snapshot };
}
