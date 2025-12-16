"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";

type Db = Database["public"]["Tables"];

type ReminderTemplateRow = Db["reminder_templates"]["Row"];
type ReminderRuleRow = Db["reminder_rules"]["Row"];

/**
 * SAFE: load existing templates only.
 * No inserts. No seeding. No throwing.
 */
export async function ensureReminderTemplatesForWorkspace(
  workspaceId: string
): Promise<Pick<ReminderTemplateRow, "id" | "name">[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("reminder_templates")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[ensureReminderTemplatesForWorkspace] load error", {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return [];
  }

  return data ?? [];
}

/**
 * SAFE: load existing rules only.
 * No inserts. No seeding. No throwing.
 */
export async function ensureReminderRulesForWorkspace(
  workspaceId: string
): Promise<Pick<ReminderRuleRow, "id" | "label">[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("reminder_rules")
    .select("id, label")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[ensureReminderRulesForWorkspace] load error", {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return [];
  }

  return data ?? [];
}
