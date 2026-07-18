import { getPlanStorageLimits } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
): Promise<void> {
  const { data: existingPlan, error: lookupError } = await admin
    .from("workspace_plans")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    throwBootstrapError("create_default_plan", userId, lookupError.code, lookupError.message);
  }

  if (existingPlan) {
    return;
  }

  const defaultLimits = getPlanStorageLimits("free");
  const { error: insertError } = await admin.from("workspace_plans").insert({
    workspace_id: workspaceId,
    plan: "free",
    invoice_limit_monthly: defaultLimits.invoice_limit_monthly,
    client_limit: defaultLimits.client_limit,
  });

  if (insertError?.code === "23505") {
    const { data: racedPlan, error: racedLookupError } = await admin
      .from("workspace_plans")
      .select("workspace_id")
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
      return;
    }
  }

  if (insertError) {
    throwBootstrapError("create_default_plan", userId, insertError.code, insertError.message);
  }
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
  workspaceId: string
): Promise<string> {
  await reloadWorkspace(admin, userId, workspaceId);
  await ensureWorkspaceSettings(admin, workspaceId, userId);
  await ensureDefaultWorkspacePlan(admin, workspaceId, userId);
  return workspaceId;
}

export async function bootstrapWorkspaceForUser(
  admin: WorkspaceBootstrapAdmin,
  userId: string
): Promise<string> {
  const existingWorkspaceId = await loadExistingWorkspaceForUser(admin, userId);
  if (existingWorkspaceId) {
    logBootstrapDev("reuse_existing_membership", {
      userId,
      workspaceId: existingWorkspaceId,
    });
    return finalizeWorkspaceBootstrap(admin, userId, existingWorkspaceId);
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
    return finalizeWorkspaceBootstrap(admin, userId, racedWorkspaceId);
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

  return finalizeWorkspaceBootstrap(admin, userId, membershipWorkspaceId);
}

export async function ensureWorkspaceForUser(userId: string): Promise<string> {
  const admin = supabaseAdmin();
  return bootstrapWorkspaceForUser(admin, userId);
}
