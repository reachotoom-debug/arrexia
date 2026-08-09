import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceEntitlementState } from "./getWorkspaceEntitlement";
import { loadEntitlementUsage } from "./usageMetering";
import { countActiveClientsForPlan } from "./assertWithinPlanLimits";

export type TrialValueSummary = {
  workspaceId: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  clientsAdded: number;
  invoicesManaged: number;
  reminderEmailsSent: number;
  aiGenerations: number;
  automatedRemindersSent: number;
  paymentsRecorded: number | null;
  paidInvoices: number | null;
  recoveredPaymentValue: number | null;
};

export async function getTrialValueSummary(
  workspaceId: string
): Promise<TrialValueSummary | null> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (
    entitlement.state !== "trial" &&
    entitlement.state !== "trial_expired"
  ) {
    return null;
  }

  const admin = supabaseAdmin();
  const [usage, activeClients, paymentsResult, paidInvoicesResult] = await Promise.all([
    loadEntitlementUsage(workspaceId, admin),
    countActiveClientsForPlan(workspaceId),
    admin
      .from("payments")
      .select("amount", { count: "exact" })
      .eq("workspace_id", workspaceId),
    admin
      .from("invoices_view")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("display_status", "paid"),
  ]);

  const recoveredPaymentValue =
    paymentsResult.data?.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) ?? null;

  return {
    workspaceId,
    trialActive: entitlement.trialActive,
    trialEndsAt: entitlement.trial?.trialEndsAt ?? null,
    clientsAdded: activeClients,
    invoicesManaged: usage.trial_invoices_created,
    reminderEmailsSent: usage.manual_email_reminders_sent,
    aiGenerations: usage.ai_generations_successful,
    automatedRemindersSent: usage.automated_reminders_sent,
    paymentsRecorded: paymentsResult.count,
    paidInvoices: paidInvoicesResult.count,
    recoveredPaymentValue,
  };
}
