import "server-only";

/**
 * Manual/pre-provider plan activation. Starter, Pro, and Business assignments set
 * active manual subscriptions until Lemon Squeezy webhooks authorize paid changes.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { provisionDefaultReminderSetupSafe } from "@/lib/reminders/provisionDefaultSetup";
import {
  CUSTOMER_ATOMIC_ACTIVATION_FAILURE_MESSAGE,
  executeAtomicWorkspacePlanChange,
} from "./atomicChangeWorkspacePlan";
import { getWorkspacePlan } from "./getWorkspacePlan";
import {
  assertCustomerPlanChangeAllowed,
  assertCustomerPaidActivationBlocked,
  classifyPlanTransition,
  CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE,
  isPaidAssignablePlan,
  needsSubscriptionRepair,
  resolveSubscriptionSyncMode,
  successMessageForTransition,
  type PlanMutationSource,
  type PlanTransitionType,
  type EffectivePlanEntitlementSource,
} from "./planMutationPolicy";
import { buildSubscriptionUpsertPayload } from "./subscriptionSyncPayload";
import { isWorkspacePlan, type BillingInterval, type WorkspacePlan } from "./plans";
import { resolveEffectiveWorkspacePlan } from "./resolveEffectiveWorkspacePlan";
import {
  loadWorkspaceSubscription,
  type WorkspaceSubscriptionSnapshot,
  type WorkspaceSubscriptionStatus,
} from "./workspaceSubscription";

export type ChangeWorkspacePlanCommand = {
  workspaceId: string;
  targetPlan: WorkspacePlan;
  source: PlanMutationSource;
  actorUserId: string;
  allowAdminOverride?: boolean;
  billingInterval?: BillingInterval;
  reason?: string;
  now?: Date;
};

export type ChangeWorkspacePlanSuccess = {
  ok: true;
  previousEffectivePlan: WorkspacePlan;
  previousStoredPlan: WorkspacePlan;
  targetPlan: WorkspacePlan;
  newStoredPlan: WorkspacePlan;
  newEffectivePlan: WorkspacePlan;
  subscriptionStatus: WorkspaceSubscriptionStatus | null;
  entitlementSource: EffectivePlanEntitlementSource;
  transitionType: PlanTransitionType;
  message: string;
};

export type ChangeWorkspacePlanFailure = {
  ok: false;
  code:
    | "INVALID_PLAN"
    | "UNSUPPORTED_PLAN"
    | "DOWNGRADE_REQUIRES_SUPPORT"
    | "PAYMENT_PROVIDER_REQUIRED"
    | "ATOMIC_MUTATION_FAILED"
    | "ACTIVATION_FAILED";
  error: string;
};

export type ChangeWorkspacePlanResult =
  | ChangeWorkspacePlanSuccess
  | ChangeWorkspacePlanFailure;

function invalidPlanFailure(): ChangeWorkspacePlanFailure {
  return {
    ok: false,
    code: "INVALID_PLAN",
    error: "Invalid plan.",
  };
}

function unsupportedPlanFailure(): ChangeWorkspacePlanFailure {
  return {
    ok: false,
    code: "UNSUPPORTED_PLAN",
    error: "That plan is not available for self-service activation.",
  };
}

function activationFailureMessage(source: PlanMutationSource): string {
  if (source === "customer_settings") {
    return CUSTOMER_ATOMIC_ACTIVATION_FAILURE_MESSAGE;
  }
  return "The selected plan could not be activated. Contact support.";
}

function atomicMutationFailure(
  source: PlanMutationSource,
  error: string
): ChangeWorkspacePlanFailure {
  console.error("[changeWorkspacePlan] atomic mutation failed", { error });
  return {
    ok: false,
    code: "ATOMIC_MUTATION_FAILED",
    error:
      source === "customer_settings"
        ? CUSTOMER_ATOMIC_ACTIVATION_FAILURE_MESSAGE
        : error,
  };
}

async function loadBillingSnapshot(
  workspaceId: string,
  now: Date
): Promise<{
  storedPlan: WorkspacePlan;
  subscription: WorkspaceSubscriptionSnapshot | null;
  effectivePlan: WorkspacePlan;
  entitlementSource: EffectivePlanEntitlementSource;
  subscriptionStatus: WorkspaceSubscriptionStatus | null;
}> {
  const admin = supabaseAdmin();
  const [planResult, subscription] = await Promise.all([
    getWorkspacePlan(workspaceId),
    loadWorkspaceSubscription(workspaceId, admin),
  ]);

  const resolution = resolveEffectiveWorkspacePlan(planResult.storedPlan, subscription, now);

  return {
    storedPlan: planResult.storedPlan,
    subscription,
    effectivePlan: resolution.effectivePlan,
    entitlementSource: resolution.entitlementSource,
    subscriptionStatus: subscription?.status ?? null,
  };
}

function resolveExpectedSubscriptionStatus(
  targetPlan: WorkspacePlan,
  syncMode: ReturnType<typeof resolveSubscriptionSyncMode>,
  existing: WorkspaceSubscriptionSnapshot | null,
  now: Date
): WorkspaceSubscriptionStatus | null {
  const payload = buildSubscriptionUpsertPayload(
    "00000000-0000-0000-0000-000000000000",
    targetPlan,
    syncMode,
    existing,
    now,
    { billingInterval: "monthly" }
  );
  if (!payload || typeof payload.status !== "string") {
    return null;
  }
  return payload.status as WorkspaceSubscriptionStatus;
}

export async function changeWorkspacePlan(
  command: ChangeWorkspacePlanCommand
): Promise<ChangeWorkspacePlanResult> {
  const now = command.now ?? new Date();

  if (!isWorkspacePlan(command.targetPlan)) {
    return invalidPlanFailure();
  }

  const targetPlan = command.targetPlan;
  const before = await loadBillingSnapshot(command.workspaceId, now);
  const resolution = resolveEffectiveWorkspacePlan(
    before.storedPlan,
    before.subscription,
    now
  );

  const transition = classifyPlanTransition(
    before.effectivePlan,
    targetPlan,
    resolution,
    command.source,
    now
  );

  if (command.source === "customer_settings") {
    const policy = assertCustomerPlanChangeAllowed(
      before.effectivePlan,
      targetPlan,
      transition
    );
    if (!policy.ok) {
      const failureCode: ChangeWorkspacePlanFailure["code"] =
        policy.code === "UNSUPPORTED_PLAN"
          ? "UNSUPPORTED_PLAN"
          : "DOWNGRADE_REQUIRES_SUPPORT";
      return {
        ok: false,
        code: failureCode,
        error:
          failureCode === "DOWNGRADE_REQUIRES_SUPPORT"
            ? "Downgrades are managed by support and cannot be applied immediately."
            : "That plan is not available for self-service activation.",
      };
    }

    const paidActivation = assertCustomerPaidActivationBlocked(targetPlan, transition);
    if (!paidActivation.ok) {
      return {
        ok: false,
        code: "PAYMENT_PROVIDER_REQUIRED",
        error: CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE,
      };
    }

    if (!isPaidAssignablePlan(targetPlan)) {
      return unsupportedPlanFailure();
    }
  }

  const syncMode = resolveSubscriptionSyncMode(
    targetPlan,
    transition,
    resolution,
    command.source,
    now
  );

  const repairOnly =
    transition === "no_op" &&
    needsSubscriptionRepair(resolution, targetPlan, now);

  if (transition === "no_op" && !repairOnly) {
    return {
      ok: true,
      previousEffectivePlan: before.effectivePlan,
      previousStoredPlan: before.storedPlan,
      targetPlan,
      newStoredPlan: before.storedPlan,
      newEffectivePlan: before.effectivePlan,
      subscriptionStatus: before.subscriptionStatus,
      entitlementSource: before.entitlementSource,
      transitionType: "no_op",
      message: successMessageForTransition(targetPlan, transition),
    };
  }

  const billingInterval: BillingInterval = command.billingInterval ?? "monthly";

  const atomicResult = await executeAtomicWorkspacePlanChange(
    {
      workspaceId: command.workspaceId,
      targetPlan,
      syncMode,
      existingSubscription: before.subscription,
      billingInterval,
      now,
    },
    supabaseAdmin()
  );

  if (!atomicResult.ok) {
    return atomicMutationFailure(command.source, atomicResult.error);
  }

  await provisionDefaultReminderSetupSafe({
    workspaceId: command.workspaceId,
    plan: targetPlan,
    admin: supabaseAdmin(),
  });

  const after = await loadBillingSnapshot(command.workspaceId, now);
  const expectedStatus = resolveExpectedSubscriptionStatus(
    targetPlan,
    syncMode,
    before.subscription,
    now
  );

  if (
    after.storedPlan !== targetPlan ||
    after.subscription?.plan !== targetPlan ||
    (expectedStatus !== null && after.subscriptionStatus !== expectedStatus) ||
    after.effectivePlan !== targetPlan
  ) {
    console.error("[changeWorkspacePlan] post-mutation verification failed", {
      workspaceId: command.workspaceId,
      targetPlan,
      storedPlan: after.storedPlan,
      subscriptionPlan: after.subscription?.plan,
      subscriptionStatus: after.subscriptionStatus,
      expectedStatus,
      effectivePlan: after.effectivePlan,
    });
    return {
      ok: false,
      code: "ACTIVATION_FAILED",
      error: activationFailureMessage(command.source),
    };
  }

  return {
    ok: true,
    previousEffectivePlan: before.effectivePlan,
    previousStoredPlan: before.storedPlan,
    targetPlan,
    newStoredPlan: after.storedPlan,
    newEffectivePlan: after.effectivePlan,
    subscriptionStatus: after.subscriptionStatus,
    entitlementSource: after.entitlementSource,
    transitionType: repairOnly ? "reactivation" : transition,
    message: successMessageForTransition(targetPlan, repairOnly ? "reactivation" : transition),
  };
}

/** Rejects non-assignable marketing plan strings at the action boundary. */
export function parseAssignableWorkspacePlan(
  value: string
): WorkspacePlan | null {
  if (!isWorkspacePlan(value)) {
    return null;
  }
  return value;
}
