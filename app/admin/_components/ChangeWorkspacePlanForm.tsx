"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { adminSetWorkspacePlanAction } from "../actions";
import type { WorkspacePlan } from "@/lib/billing/plans";

const PLAN_OPTIONS: WorkspacePlan[] = ["free", "starter", "pro"];

type ChangeWorkspacePlanFormProps = {
  workspaceId: string;
  currentPlan: WorkspacePlan;
};

export function ChangeWorkspacePlanForm({
  workspaceId,
  currentPlan,
}: ChangeWorkspacePlanFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label={`Change plan for workspace ${workspaceId}`}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-60"
      value={currentPlan}
      disabled={isPending}
      onChange={(event) => {
        const nextPlan = event.target.value;
        if (nextPlan === currentPlan) return;

        startTransition(async () => {
          const result = await adminSetWorkspacePlanAction(workspaceId, nextPlan);
          if (result.ok) {
            toast({ title: "Plan updated", description: `Workspace set to ${nextPlan}.` });
            router.refresh();
          } else {
            toast({
              variant: "destructive",
              title: "Plan update failed",
              description: result.error ?? "Please try again.",
            });
            router.refresh();
          }
        });
      }}
    >
      {PLAN_OPTIONS.map((plan) => (
        <option key={plan} value={plan}>
          {plan}
        </option>
      ))}
    </select>
  );
}
