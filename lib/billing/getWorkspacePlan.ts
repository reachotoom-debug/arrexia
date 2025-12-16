import { supabaseAdmin } from "@/lib/supabase/admin";

export type WorkspacePlan = "free" | "starter" | "pro";

const DEFAULT_PLAN: WorkspacePlan = "free";
const DEFAULT_INVOICE_LIMIT = 5;
const DEFAULT_CLIENT_LIMIT = 5;

export async function getWorkspacePlan(workspaceId: string) {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("workspace_plans")
    .select("plan, invoice_limit_monthly, client_limit")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workspace plan: ${error.message}`);
  }

  if (data) {
    return {
      plan: (data.plan as WorkspacePlan) ?? DEFAULT_PLAN,
      invoiceLimitMonthly: data.invoice_limit_monthly ?? null,
      clientLimit: data.client_limit ?? null,
    };
  }

  const { error: insertError } = await supabase
    .from("workspace_plans")
    .insert({
      workspace_id: workspaceId,
      plan: DEFAULT_PLAN,
      invoice_limit_monthly: DEFAULT_INVOICE_LIMIT,
      client_limit: DEFAULT_CLIENT_LIMIT,
    });

  if (insertError && insertError.code !== "23505") {
    throw new Error(
      `Failed to insert default workspace plan: ${insertError.message}`
    );
  }

  return {
    plan: DEFAULT_PLAN,
    invoiceLimitMonthly: DEFAULT_INVOICE_LIMIT,
    clientLimit: DEFAULT_CLIENT_LIMIT,
  };
}
