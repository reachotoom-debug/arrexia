import { assertBootstrapActivationAllowed } from "@/lib/auth/accountActivation";
import { AUTH_ACCOUNT_NOT_ACTIVATED_MESSAGE } from "@/lib/auth/authErrors";
import { getPlanStorageLimits, isWorkspacePlan, type WorkspacePlan } from "@/lib/billing/plans";
import {
  type SignupMarketingPlanIntent,
} from "@/lib/billing/publicTrialPlan";
import { createArrexiaTrialSubscription } from "@/lib/billing/createPublicTrialSubscription";
import { loadWorkspaceSubscription } from "@/lib/billing/workspaceSubscription";
import {
  provisionDefaultReminderSetupSafe,
} from "@/lib/reminders/provisionDefaultSetup";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureWorkspaceEmailSettings } from "./ensureWorkspaceEmailSettings";

export const WORKSPACE_BOOTSTRAP_FAILED_MESSAGE =
  "Your account is confirmed, but workspace setup failed. Please try again.";

/** Columns written during workspace bootstrap — must match repository migrations. */
export const ORGANIZATION_BOOTSTRAP_COLUMNS = ["name"] as const;

export type BootstrapStage =
  | "load_existing_membership"
  | "create_organization"
  | "create_workspace"
  | "create_owner_membership"
  | "create_settings"
  | "create_default_plan"
  | "reload_workspace";

export class WorkspaceBootstrapError extends Error {
  readonly stage: BootstrapStage;
  readonly userId: string;
  readonly supabaseCode: string | null;

  constructor(
    stage: BootstrapStage,
    userId: string,
    supabaseCode: string | null,
    internalMessage: string
  ) {
    super(WORKSPACE_BOOTSTRAP_FAILED_MESSAGE);
    this.name = "WorkspaceBootstrapError";
    this.stage = stage;
    this.userId = userId;
    this.supabaseCode = supabaseCode;
    logBootstrapFailure(stage, {
      userId,
      supabaseCode,
      internal: internalMessage,
    });
  }
}

export type WorkspaceBootstrapOptions = {
  /** Marketing attribution only — does not affect entitlement. */
  initialTrialPlan?: SignupMarketingPlanIntent | null;
};

export type DefaultWorkspacePlanResult = {
  planCreated: boolean;
  plan: WorkspacePlan;
};

export type WorkspaceBootstrapAdmin = Pick<
  ReturnType<typeof supabaseAdmin>,
  "from" | "auth"
>;

export function buildOrganizationInsertPayload(name: string): { name: string } {
  return { name };
}

function deriveOrganizationName(email: string | null | undefined): string {
  if (!email) return "My Organization";
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "My Organization";
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

function logBootstrapDev(step: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(`[workspace/bootstrap] ${step}`, details);
}

function logBootstrapFailure(step: string, details: Record<string, unknown>): void {
  console.error(`[workspace/bootstrap] ${step}`, details);
}

function throwBootstrapError(
  stage: BootstrapStage,
  userId: string,
  supabaseCode: string | null | undefined,
  internalMessage: string
): never {
  throw new WorkspaceBootstrapError(stage, userId, supabaseCode ?? null, internalMessage);
}

export async function loadExistingWorkspaceForUser(
  admin: WorkspaceBootstrapAdmin,
  userId: string
): Promise<string | null> {
  const { data: memberships, error } = await admin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throwBootstrapError("load_existing_membership", userId, error.code, error.message);
  }

  return memberships?.[0]?.workspace_id ?? null;
}

export async function reloadWorkspace(
  admin: WorkspaceBootstrapAdmin,
  userId: string,
  workspaceId: string
): Promise<{ id: string; organization_id: string }> {
  const { data: workspaceRow, error } = await admin
    .from("workspaces")
    .select("id, organization_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throwBootstrapError("reload_workspace", userId, error.code, error.message);
  }

  if (!workspaceRow?.id || !workspaceRow.organization_id) {
    throwBootstrapError(
      "reload_workspace",
      userId,
      null,
      workspaceRow?.id
        ? "workspace exists but organization_id is missing"
        : "workspace not found for membership"
    );
  }

  return {
    id: workspaceRow.id,
    organization_id: workspaceRow.organization_id,
  };
}

export async function ensureWorkspaceSettings(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string,
  userId: string
): Promise<void> {
  const { data: existingSettings, error: lookupError } = await admin
    .from("settings")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    logBootstrapFailure("create_settings", {
      userId,
      workspaceId,
      supabaseCode: lookupError.code,
      internal: lookupError.message,
    });
    return;
  }

  if (existingSettings) {
    return;
  }

  const { error: insertError } = await admin.from("settings").insert({
    workspace_id: workspaceId,
    default_currency: "USD",
    auto_send_reminders: false,
  });

  if (insertError && insertError.code !== "23505") {
    logBootstrapFailure("create_settings", {
      userId,
      workspaceId,
      supabaseCode: insertError.code,
      internal: insertError.message,
    });
  }
}

export async function ensureDefaultWorkspacePlan(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string,
  userId: string
): Promise<DefaultWorkspacePlanResult> {
  const { data: existingPlan, error: lookupError } = await admin
    .from("workspace_plans")
    .select("workspace_id, plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    throwBootstrapError("create_default_plan", userId, lookupError.code, lookupError.message);
  }

  if (existingPlan) {
    const plan = isWorkspacePlan(existingPlan.plan) ? existingPlan.plan : "free";
    return { planCreated: false, plan };
  }

  const plan: WorkspacePlan = "free";
  const defaultLimits = getPlanStorageLimits(plan);
  const { error: insertError } = await admin.from("workspace_plans").insert({
    workspace_id: workspaceId,
    plan,
    invoice_limit_monthly: defaultLimits.invoice_limit_monthly,
    client_limit: defaultLimits.client_limit,
  });

  if (insertError?.code === "23505") {
    const { data: racedPlan, error: racedLookupError } = await admin
      .from("workspace_plans")
      .select("workspace_id, plan")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (racedLookupError) {
      throwBootstrapError(
        "create_default_plan",
        userId,
        racedLookupError.code,
        racedLookupError.message
      );
    }

    if (racedPlan) {
      const racedPlanId = isWorkspacePlan(racedPlan.plan) ? racedPlan.plan : "free";
      return { planCreated: false, plan: racedPlanId };
    }
  }

  if (insertError) {
    throwBootstrapError("create_default_plan", userId, insertError.code, insertError.message);
  }

  return { planCreated: true, plan };
}

/**
 * Ensures the standalone Arrexia trial exists once without restarting on retries.
 */
export async function ensureStandaloneTrialIfNeeded(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string,
  userId: string,
  options?: { planCreated?: boolean }
): Promise<{ created: boolean }> {
  const [subscription, workspaceResult] = await Promise.all([
    loadWorkspaceSubscription(workspaceId, admin),
    admin
      .from("workspaces")
      .select("created_at, trial_consumed_at")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  const workspaceTrialConsumedAt =
    (workspaceResult.data?.trial_consumed_at as string | null | undefined) ?? null;

  if (
    workspaceTrialConsumedAt ||
    subscription?.trialConsumedAt ||
    subscription?.trialStartsAt
  ) {
    return { created: false };
  }

  if (!options?.planCreated) {
    const createdAt = workspaceResult.data?.created_at
      ? Date.parse(String(workspaceResult.data.created_at))
      : NaN;
    const recoveryWindowMs = 30 * 60 * 1000;
    const withinRecoveryWindow =
      Number.isFinite(createdAt) && Date.now() - createdAt <= recoveryWindowMs;

    if (!withinRecoveryWindow) {
      return { created: false };
    }
  }

  const result = await createArrexiaTrialSubscription(workspaceId, admin);
  if (!result.ok && result.reason !== "trial_already_consumed") {
    throwBootstrapError("create_default_plan", userId, null, result.reason);
  }

  return { created: result.ok && result.created };
}

/** @deprecated Standalone trial no longer depends on signup plan intent. */
export async function maybePromoteFreePlanToPublicTrial(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string,
  userId: string,
  _options: {
    initialTrialPlan?: SignupMarketingPlanIntent | null;
    planCreated: boolean;
    currentPlan: WorkspacePlan;
  }
): Promise<WorkspacePlan> {
  void _options;
  await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
    planCreated: _options.planCreated,
  });
  return "free";
}

export async function ensureOwnerMembership(
  admin: WorkspaceBootstrapAdmin,
  userId: string,
  workspaceId: string
): Promise<string> {
  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: workspaceId,
    user_id: userId,
    role: "owner",
  });

  if (!memberError) {
    return workspaceId;
  }

  if (memberError.code === "23505") {
    const racedWorkspaceId = await loadExistingWorkspaceForUser(admin, userId);
    if (racedWorkspaceId) {
      return racedWorkspaceId;
    }
  }

  throwBootstrapError(
    "create_owner_membership",
    userId,
    memberError.code,
    memberError.message
  );
}

async function finalizeWorkspaceBootstrap(
  admin: WorkspaceBootstrapAdmin,
  userId: string,
  workspaceId: string,
  _options?: WorkspaceBootstrapOptions
): Promise<string> {
  void _options;
  await reloadWorkspace(admin, userId, workspaceId);
  await ensureWorkspaceSettings(admin, workspaceId, userId);
  await ensureWorkspaceEmailSettings(admin, workspaceId);

  const planResult = await ensureDefaultWorkspacePlan(admin, workspaceId, userId);
  const trialResult = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
    planCreated: planResult.planCreated,
  });

  const { data: planRow, error: planLookupError } = await admin
    .from("workspace_plans")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (planLookupError) {
    logBootstrapFailure("provision_default_reminders", {
      userId,
      workspaceId,
      supabaseCode: planLookupError.code,
      internal: planLookupError.message,
    });
  } else {
    const resolvedPlan = isWorkspacePlan(planRow?.plan) ? planRow.plan : "free";
    await provisionDefaultReminderSetupSafe({
      workspaceId,
      plan: resolvedPlan,
      standaloneTrial: true,
      admin,
    });
  }

  void trialResult;
  return workspaceId;
}

export async function bootstrapWorkspaceForUser(
  admin: WorkspaceBootstrapAdmin,
  userId: string,
  options?: WorkspaceBootstrapOptions
): Promise<string> {
  const existingWorkspaceId = await loadExistingWorkspaceForUser(admin, userId);
  if (existingWorkspaceId) {
    logBootstrapDev("reuse_existing_membership", {
      userId,
      workspaceId: existingWorkspaceId,
    });
    return finalizeWorkspaceBootstrap(admin, userId, existingWorkspaceId, options);
  }

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
  if (authUserError) {
    throwBootstrapError(
      "load_existing_membership",
      userId,
      authUserError.code ?? null,
      authUserError.message
    );
  }

  const racedWorkspaceId = await loadExistingWorkspaceForUser(admin, userId);
  if (racedWorkspaceId) {
    return finalizeWorkspaceBootstrap(admin, userId, racedWorkspaceId, options);
  }

  const orgName = deriveOrganizationName(authUser.user?.email);
  const orgPayload = buildOrganizationInsertPayload(orgName);

  const { data: orgRow, error: orgError } = await admin
    .from("organizations")
    .insert(orgPayload)
    .select("id")
    .single();

  if (orgError || !orgRow?.id) {
    throwBootstrapError(
      "create_organization",
      userId,
      orgError?.code ?? null,
      orgError?.message ?? "organization insert returned no id"
    );
  }

  logBootstrapDev("organization_created", {
    userId,
    organizationId: orgRow.id,
  });

  const { data: workspaceRow, error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      name: "My Workspace",
      organization_id: orgRow.id,
    })
    .select("id, organization_id")
    .single();

  if (workspaceError || !workspaceRow?.id) {
    throwBootstrapError(
      "create_workspace",
      userId,
      workspaceError?.code ?? null,
      workspaceError?.message ?? "workspace insert returned no id"
    );
  }

  if (!workspaceRow.organization_id) {
    throwBootstrapError(
      "create_workspace",
      userId,
      null,
      "workspace insert returned null organization_id"
    );
  }

  logBootstrapDev("workspace_created", {
    userId,
    workspaceId: workspaceRow.id,
    organizationId: workspaceRow.organization_id,
  });

  const membershipWorkspaceId = await ensureOwnerMembership(admin, userId, workspaceRow.id);

  logBootstrapDev("bootstrap_complete", {
    userId,
    workspaceId: membershipWorkspaceId,
    organizationId: workspaceRow.organization_id,
  });

  return finalizeWorkspaceBootstrap(admin, userId, membershipWorkspaceId, options);
}

export async function ensureWorkspaceForUser(
  userId: string,
  options?: WorkspaceBootstrapOptions
): Promise<string> {
  const admin = supabaseAdmin();
  const existingWorkspaceId = await loadExistingWorkspaceForUser(admin, userId);
  const activationDecision = await assertBootstrapActivationAllowed(
    userId,
    Boolean(existingWorkspaceId)
  );

  if (!activationDecision.allowed) {
    if (activationDecision.reason === "not_activated") {
      throw new Error(AUTH_ACCOUNT_NOT_ACTIVATED_MESSAGE);
    }

    throwBootstrapError(
      "load_existing_membership",
      userId,
      null,
      "activation lookup failed"
    );
  }

  return bootstrapWorkspaceForUser(admin, userId, options);
}
