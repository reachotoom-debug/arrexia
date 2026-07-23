import type { SupabaseClient } from "@supabase/supabase-js";

export type AutomationGateSkipReason =
  | "automation_disabled"
  | "automation_null"
  | "settings_missing"
  | "settings_query_failed";

export type AutomationGateResult =
  | { allowed: true }
  | { allowed: false; skipReason: AutomationGateSkipReason };

/**
 * Pure decision: automatic cron sending is allowed only when explicitly true.
 */
export function evaluateAutomationGate(
  autoSendReminders: boolean | null | undefined
): AutomationGateResult {
  if (autoSendReminders === true) {
    return { allowed: true };
  }

  if (autoSendReminders === false) {
    return { allowed: false, skipReason: "automation_disabled" };
  }

  if (autoSendReminders == null) {
    return { allowed: false, skipReason: "automation_null" };
  }

  return { allowed: false, skipReason: "automation_null" };
}

export async function loadAutomationGateForWorkspace(
  supabase: Pick<SupabaseClient, "from">,
  workspaceId: string
): Promise<AutomationGateResult> {
  const { data, error } = await supabase
    .from("settings")
    .select("auto_send_reminders")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[loadAutomationGateForWorkspace] settings query failed", {
      workspaceId,
      error,
    });
    return { allowed: false, skipReason: "settings_query_failed" };
  }

  if (!data) {
    return { allowed: false, skipReason: "settings_missing" };
  }

  return evaluateAutomationGate(data.auto_send_reminders);
}

export function automationGateSkipMessage(
  skipReason: AutomationGateSkipReason
): string {
  switch (skipReason) {
    case "automation_disabled":
      return "Automatic reminders are disabled for this workspace.";
    case "automation_null":
      return "Automatic reminders are not enabled for this workspace.";
    case "settings_missing":
      return "Workspace settings are missing; automatic reminders skipped.";
    case "settings_query_failed":
      return "Failed to load workspace settings; automatic reminders skipped.";
    default:
      return "Automatic reminders skipped.";
  }
}
