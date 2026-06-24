import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanStorageLimits } from "./plans";
import { getInvoiceUsageThisMonth } from "./getInvoiceUsageThisMonth";
import { getWorkspacePlan } from "./getWorkspacePlan";

type PlanLimitCode = "PLAN_LIMIT_INVOICES" | "PLAN_LIMIT_CLIENTS";

export const PLAN_LIMIT_CLIENTS_MESSAGE =
  "Client limit reached for your current plan. Upgrade your plan or archive unused clients.";

export const PLAN_LIMIT_INVOICES_MESSAGE =
  "Monthly invoice limit reached for your current plan. Upgrade your plan to create more invoices.";

export class PlanLimitError extends Error {
  code: PlanLimitCode;

  constructor(code: PlanLimitCode, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
  }
}

export type ClientPlanUsage = {
  plan: string;
  activeClientCount: number;
  clientLimit: number | null;
  includesArchived: false;
  includesInactive: true;
};

/** Count billable clients: same workspace, not archived. Inactive clients are included. */
export async function countActiveClientsForPlan(workspaceId: string): Promise<number> {
  const admin = supabaseAdmin();
  const { count, error } = await admin
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);

  if (error) {
    throw new Error(`Failed to count clients: ${error.message}`);
  }

  return count ?? 0;
}

export async function getClientPlanUsage(workspaceId: string): Promise<ClientPlanUsage> {
  const plan = await getWorkspacePlan(workspaceId);
  const activeClientCount = await countActiveClientsForPlan(workspaceId);

  return {
    plan: plan.plan,
    activeClientCount,
    clientLimit: plan.clientLimit,
    includesArchived: false,
    includesInactive: true,
  };
}

export async function assertInvoiceCreateAllowed(workspaceId: string) {
  const usage = await getInvoiceUsageThisMonth(workspaceId);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new PlanLimitError("PLAN_LIMIT_INVOICES", PLAN_LIMIT_INVOICES_MESSAGE);
  }
}

export async function assertClientCreateAllowed(workspaceId: string) {
  const usage = await getClientPlanUsage(workspaceId);
  const limit = usage.clientLimit;

  if (limit === null) {
    return;
  }

  console.log("[assertClientCreateAllowed] client count check", {
    workspaceId,
    plan: usage.plan,
    currentCount: usage.activeClientCount,
    limit,
    countsArchivedClients: false,
    countsInactiveClients: true,
    underLimit: usage.activeClientCount < limit,
  });

  if (usage.activeClientCount >= limit) {
    throw new PlanLimitError("PLAN_LIMIT_CLIENTS", PLAN_LIMIT_CLIENTS_MESSAGE);
  }
}

export type { PlanLimitCode };
