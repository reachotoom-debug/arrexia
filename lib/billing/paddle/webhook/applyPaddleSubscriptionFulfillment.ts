import "server-only";

import { provisionDefaultReminderSetupSafe } from "@/lib/reminders/provisionDefaultSetup";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  parseAtomicWorkspacePlanSnapshot,
  verifyAtomicWorkspacePlanSnapshot,
  type AtomicWorkspacePlanChangeResult,
} from "../../atomicChangeWorkspacePlan";
import { getPlanStorageLimits, type BillingInterval, type WorkspacePlan } from "../../plans";
import type { WorkspaceSubscriptionSnapshot, WorkspaceSubscriptionStatus } from "../../workspaceSubscription";
import { persistPaddleProviderIdentity } from "./resolvePaddleWorkspace";

export type ApplyPaddleSubscriptionFulfillmentInput = {
  workspaceId: string;
  targetPlan: WorkspacePlan;
  billingInterval: BillingInterval;
  status: WorkspaceSubscriptionStatus;
  periodStartsAt: string | null;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  existingSubscription: WorkspaceSubscriptionSnapshot | null;
  now?: Date;
};

export type ApplyPaddleSubscriptionFulfillmentResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_payload"
        | "rpc_failed"
        | "snapshot_mismatch"
        | "provider_identity_failed";
      error: string;
    };

export function buildPaddleAtomicRpcParams(
  input: ApplyPaddleSubscriptionFulfillmentInput
): Record<string, unknown> | null {
  const limits = getPlanStorageLimits(input.targetPlan);
  const existing = input.existingSubscription;

  return {
    p_workspace_id: input.workspaceId,
    p_target_plan: input.targetPlan,
    p_invoice_limit_monthly: limits.invoice_limit_monthly,
    p_client_limit: limits.client_limit,
    p_subscription_status: input.status,
    p_subscription_plan: input.targetPlan,
    p_payment_provider: "paddle",
    p_trial_starts_at: existing?.trialStartsAt ?? null,
    p_trial_ends_at: existing?.trialEndsAt ?? null,
    p_current_period_starts_at: input.periodStartsAt,
    p_current_period_ends_at: input.periodEndsAt,
    p_cancel_at_period_end: input.cancelAtPeriodEnd,
    p_billing_interval: input.billingInterval,
  };
}

async function executePaddleAtomicRpc(
  rpcParams: Record<string, unknown>,
  targetPlan: WorkspacePlan,
  expectedStatus: WorkspaceSubscriptionStatus,
  admin = supabaseAdmin()
): Promise<AtomicWorkspacePlanChangeResult> {
  const { data, error } = await admin.rpc("rpc_change_workspace_plan_atomic", rpcParams);

  if (error) {
    return { ok: false, reason: "rpc_failed", error: error.message };
  }

  const snapshot = parseAtomicWorkspacePlanSnapshot(data);
  if (!snapshot) {
    return {
      ok: false,
      reason: "invalid_snapshot",
      error: "Atomic billing RPC returned an invalid snapshot.",
    };
  }

  if (!verifyAtomicWorkspacePlanSnapshot(snapshot, targetPlan, expectedStatus)) {
    return {
      ok: false,
      reason: "snapshot_mismatch",
      error: "Atomic billing RPC snapshot did not match the requested Paddle mutation.",
    };
  }

  return { ok: true, snapshot };
}

/** Applies verified Paddle subscription state via the existing atomic billing RPC. */
export async function applyPaddleSubscriptionFulfillment(
  input: ApplyPaddleSubscriptionFulfillmentInput
): Promise<ApplyPaddleSubscriptionFulfillmentResult> {
  const rpcParams = buildPaddleAtomicRpcParams(input);
  if (!rpcParams) {
    return {
      ok: false,
      code: "invalid_payload",
      error: "Paddle subscription payload could not be built.",
    };
  }

  const expectedStatus = input.status;
  const admin = supabaseAdmin();
  const atomicResult = await executePaddleAtomicRpc(
    rpcParams,
    input.targetPlan,
    expectedStatus,
    admin
  );

  if (!atomicResult.ok) {
    return {
      ok: false,
      code: atomicResult.reason === "rpc_failed" ? "rpc_failed" : "snapshot_mismatch",
      error: atomicResult.error,
    };
  }

  if (input.providerCustomerId || input.providerSubscriptionId) {
    try {
      await persistPaddleProviderIdentity(input.workspaceId, {
        providerCustomerId: input.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId,
      }, admin);
    } catch (error) {
      return {
        ok: false,
        code: "provider_identity_failed",
        error: error instanceof Error ? error.message : "Provider identity persistence failed.",
      };
    }
  }

  await provisionDefaultReminderSetupSafe({
    workspaceId: input.workspaceId,
    plan: input.targetPlan,
    admin,
  });

  return { ok: true };
}

/** @internal test hook — reuse atomic RPC execution without provider side effects. */
export async function executePaddleAtomicWorkspacePlanChangeForTests(
  input: ApplyPaddleSubscriptionFulfillmentInput
): Promise<AtomicWorkspacePlanChangeResult> {
  const rpcParams = buildPaddleAtomicRpcParams(input);
  if (!rpcParams) {
    return {
      ok: false,
      reason: "invalid_payload",
      error: "invalid payload",
    };
  }

  return executePaddleAtomicRpc(rpcParams, input.targetPlan, input.status);
}
