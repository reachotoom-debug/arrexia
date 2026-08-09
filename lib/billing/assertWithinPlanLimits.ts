import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  PLAN_LIMIT_CLIENTS_MESSAGE,
  PLAN_LIMIT_INVOICES_MESSAGE,
  PlanLimitError,
  type PlanLimitCode,
} from "./planLimitMessages";

export {
  PLAN_LIMIT_CLIENTS_MESSAGE,
  PLAN_LIMIT_INVOICES_MESSAGE,
  PlanLimitError,
  type PlanLimitCode,
};

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
  const { getWorkspaceEntitlementState } = await import("./getWorkspaceEntitlement");
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  const activeClientCount = await countActiveClientsForPlan(workspaceId);

  return {
    plan: entitlement.paidPlan ?? entitlement.plan,
    activeClientCount,
    clientLimit: entitlement.clientLimit,
    includesArchived: false,
    includesInactive: true,
  };
}

export async function assertInvoiceCreateAllowed(workspaceId: string) {
  const { assertInvoiceCreateEntitlement } = await import("./entitlementGuard");
  await assertInvoiceCreateEntitlement(workspaceId);
}

export async function assertClientCreateAllowed(workspaceId: string) {
  const { assertClientCreateEntitlement } = await import("./entitlementGuard");
  await assertClientCreateEntitlement(workspaceId);
}
