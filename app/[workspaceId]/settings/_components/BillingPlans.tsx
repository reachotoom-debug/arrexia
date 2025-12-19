import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { BillingPlansClient } from "./BillingPlansClient";

export async function BillingPlans({ workspaceId }: { workspaceId: string }) {
  const current = await getWorkspacePlan(workspaceId);
  return (
    <BillingPlansClient workspaceId={workspaceId} currentPlan={current.plan} />
  );
}
