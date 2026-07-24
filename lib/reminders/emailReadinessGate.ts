import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailSkipReason =
  | "email_settings_missing"
  | "smtp_configuration_incomplete";

export type EmailReadinessResult =
  | { ready: true }
  | { ready: false; skipReason: EmailSkipReason };

export type EmailReadinessRow = {
  smtp_host: string | null;
  smtp_port: number | null;
};

/**
 * Pure decision: automatic sending requires a provisioned email settings row.
 * SMTP workspaces must also have host + port configured.
 */
export function evaluateEmailReadiness(params: {
  emailSettingsRow: EmailReadinessRow | null;
  emailProvider?: string | null;
}): EmailReadinessResult {
  if (!params.emailSettingsRow) {
    return { ready: false, skipReason: "email_settings_missing" };
  }

  if (params.emailProvider === "smtp") {
    const host = params.emailSettingsRow.smtp_host?.trim();
    const port = params.emailSettingsRow.smtp_port;
    if (!host || port == null || port <= 0) {
      return { ready: false, skipReason: "smtp_configuration_incomplete" };
    }
  }

  return { ready: true };
}

export async function loadEmailReadinessForWorkspace(
  supabase: Pick<SupabaseClient, "from">,
  workspaceId: string
): Promise<EmailReadinessResult> {
  const [{ data: settingsRow }, { data: emailSettingsRow, error: emailError }] =
    await Promise.all([
      supabase
        .from("settings")
        .select("email_provider")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("workspace_email_settings")
        .select("smtp_host, smtp_port")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

  if (emailError) {
    console.error("[loadEmailReadinessForWorkspace] email settings query failed", {
      workspaceId,
      error: emailError,
    });
    return { ready: false, skipReason: "email_settings_missing" };
  }

  return evaluateEmailReadiness({
    emailSettingsRow: emailSettingsRow ?? null,
    emailProvider: settingsRow?.email_provider,
  });
}

export function emailReadinessSkipMessage(skipReason: EmailSkipReason): string {
  switch (skipReason) {
    case "email_settings_missing":
      return "Workspace email settings are missing; automatic reminders skipped.";
    case "smtp_configuration_incomplete":
      return "SMTP email settings are incomplete; automatic reminders skipped.";
    default:
      return "Email is not ready for automatic reminders.";
  }
}
