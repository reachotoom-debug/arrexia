import type { WorkspaceBootstrapAdmin } from "./ensureWorkspaceForUser";

export type EnsureWorkspaceEmailSettingsResult = {
  created: boolean;
  existing: boolean;
};

function logEmailSettingsFailure(
  workspaceId: string,
  details: Record<string, unknown>
): void {
  console.error("[workspace/bootstrap] create_email_settings", {
    workspaceId,
    ...details,
  });
}

/**
 * Create-only provisioning for workspace_email_settings (R2G).
 * Inserts a minimal row when missing; never updates existing configuration.
 */
export async function ensureWorkspaceEmailSettings(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string
): Promise<EnsureWorkspaceEmailSettingsResult> {
  const { data: existing, error: lookupError } = await admin
    .from("workspace_email_settings")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    logEmailSettingsFailure(workspaceId, {
      supabaseCode: lookupError.code,
      internal: lookupError.message,
    });
    return { created: false, existing: false };
  }

  if (existing) {
    return { created: false, existing: true };
  }

  const { error: insertError } = await admin.from("workspace_email_settings").insert({
    workspace_id: workspaceId,
  });

  if (insertError?.code === "23505") {
    return { created: false, existing: true };
  }

  if (insertError) {
    logEmailSettingsFailure(workspaceId, {
      supabaseCode: insertError.code,
      internal: insertError.message,
    });
    return { created: false, existing: false };
  }

  return { created: true, existing: false };
}
