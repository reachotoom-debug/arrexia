import { supabaseAdmin } from "@/lib/supabase/admin";
import { getInvoiceUsageThisMonth } from "./getInvoiceUsageThisMonth";
import { getWorkspacePlan } from "./getWorkspacePlan";

type PlanLimitCode = "PLAN_LIMIT_INVOICES" | "PLAN_LIMIT_CLIENTS";

class PlanLimitError extends Error {
  code: PlanLimitCode;
  constructor(code: PlanLimitCode, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
  }
}

export async function assertInvoiceCreateAllowed(workspaceId: string) {
  const usage = await getInvoiceUsageThisMonth(workspaceId);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new PlanLimitError(
      "PLAN_LIMIT_INVOICES",
      "Monthly invoice limit reached for current plan"
    );
  }
}

export async function assertClientCreateAllowed(workspaceId: string) {
  const plan = await getWorkspacePlan(workspaceId);
  const limit = plan.clientLimit ?? null;

  if (limit === null) {
    return;
  }

  const admin = supabaseAdmin();
  const { count, error } = await admin
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to count clients: ${error.message}`);
  }

  if ((count ?? 0) >= limit) {
    throw new PlanLimitError(
      "PLAN_LIMIT_CLIENTS",
      "Client limit reached for current plan"
    );
  }
}

export type { PlanLimitCode, PlanLimitError };
