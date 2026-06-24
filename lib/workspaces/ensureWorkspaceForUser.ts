import { getPlanStorageLimits } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const WORKSPACE_BOOTSTRAP_FAILED_MESSAGE =
  "Your account is confirmed, but workspace setup failed. Please try again.";

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

function bootstrapError(step: string, userId: string, internal?: string | null): Error {
  logBootstrapFailure(step, { userId, internal: internal ?? null });
  return new Error(WORKSPACE_BOOTSTRAP_FAILED_MESSAGE);
}

async function getExistingMembershipWorkspaceId(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<string | null> {
  const { data: memberships, error } = await admin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw bootstrapError("membership_lookup_failed", userId, error.message);
  }

  return memberships?.[0]?.workspace_id ?? null;
}

async function ensureDefaultSettings(
  admin: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  userId: string
): Promise<void> {
  const { data: existingSettings, error: lookupError } = await admin
    .from("settings")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    logBootstrapFailure("settings_lookup_failed", {
      userId,
      workspaceId,
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
    logBootstrapFailure("settings_create_failed", {
      userId,
      workspaceId,
      internal: insertError.message,
    });
  }
}

async function ensureDefaultWorkspacePlanIfMissing(
  admin: ReturnType<typeof supabaseAdmin>,
  workspaceId: string,
  userId: string
): Promise<void> {
  const { data: existingPlan, error: lookupError } = await admin
    .from("workspace_plans")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    logBootstrapFailure("plan_lookup_failed", {
      userId,
      workspaceId,
      internal: lookupError.message,
    });
    return;
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

  if (insertError && insertError.code !== "23505") {
    logBootstrapFailure("plan_create_failed", {
      userId,
      workspaceId,
      internal: insertError.message,
    });
  }
}

export async function ensureWorkspaceForUser(userId: string): Promise<string> {
  const admin = supabaseAdmin();

  const existingWorkspaceId = await getExistingMembershipWorkspaceId(admin, userId);
  if (existingWorkspaceId) {
    logBootstrapDev("reuse_existing_membership", {
      userId,
      workspaceId: existingWorkspaceId,
    });
    return existingWorkspaceId;
  }

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
  if (authUserError) {
    throw bootstrapError("auth_user_lookup_failed", userId, authUserError.message);
  }

  const orgName = deriveOrganizationName(authUser.user?.email);

  const { data: orgRow, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: orgName,
      default_currency: "USD",
      timezone: "UTC",
      settings: {},
    })
    .select("id")
    .single();

  if (orgError || !orgRow?.id) {
    throw bootstrapError("organization_create_failed", userId, orgError?.message ?? "no id");
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
    throw bootstrapError("workspace_create_failed", userId, workspaceError?.message ?? "no id");
  }

  if (!workspaceRow.organization_id) {
    throw bootstrapError(
      "workspace_missing_organization_id",
      userId,
      "workspace insert returned null organization_id"
    );
  }

  logBootstrapDev("workspace_created", {
    userId,
    workspaceId: workspaceRow.id,
    organizationId: workspaceRow.organization_id,
  });

  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: workspaceRow.id,
    user_id: userId,
    role: "owner",
  });

  if (memberError) {
    if (memberError.code === "23505") {
      const racedWorkspaceId = await getExistingMembershipWorkspaceId(admin, userId);
      if (racedWorkspaceId) {
        return racedWorkspaceId;
      }
    }
    throw bootstrapError("membership_create_failed", userId, memberError.message);
  }

  await ensureDefaultSettings(admin, workspaceRow.id, userId);
  await ensureDefaultWorkspacePlanIfMissing(admin, workspaceRow.id, userId);

  logBootstrapDev("bootstrap_complete", {
    userId,
    workspaceId: workspaceRow.id,
    organizationId: workspaceRow.organization_id,
  });

  return workspaceRow.id;
}
