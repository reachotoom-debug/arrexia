"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { adminSetWorkspacePlanAction } from "../actions";
import {
  normalizeBillingInterval,
  type BillingInterval,
  type WorkspacePlan,
} from "@/lib/billing/plans";

const PLAN_OPTIONS: WorkspacePlan[] = ["free", "starter", "pro", "business"];

function isPaidPlan(plan: WorkspacePlan): boolean {
  return plan === "starter" || plan === "pro" || plan === "business";
}

type ChangeWorkspacePlanFormProps = {
  workspaceId: string;
  currentPlan: WorkspacePlan;
  currentBillingInterval?: BillingInterval;
};

export function ChangeWorkspacePlanForm({
  workspaceId,
  currentPlan,
  currentBillingInterval,
}: ChangeWorkspacePlanFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    normalizeBillingInterval(currentBillingInterval)
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Change plan for workspace ${workspaceId}`}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-60"
        value={currentPlan}
        disabled={isPending}
        onChange={(event) => {
          const nextPlan = event.target.value as WorkspacePlan;
          if (nextPlan === currentPlan) return;

          startTransition(async () => {
            const result = await adminSetWorkspacePlanAction(
              workspaceId,
              nextPlan,
              isPaidPlan(nextPlan) ? billingInterval : undefined
            );
            if (result.ok) {
              const effective = result.effectivePlan ?? nextPlan;
              const stored = result.storedPlan ?? nextPlan;
              toast({
                title: "Plan updated",
                description:
                  effective === stored
                    ? `Workspace set to ${stored} (effective: ${effective}).`
                    : `Stored ${stored}; effective entitlement ${effective}.`,
              });
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

      {isPaidPlan(currentPlan) ? (
        <select
          aria-label={`Billing interval for workspace ${workspaceId}`}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-60"
          value={billingInterval}
          disabled={isPending}
          onChange={(event) => {
            const nextInterval = event.target.value as BillingInterval;
            if (nextInterval === billingInterval) return;
            setBillingInterval(nextInterval);

            startTransition(async () => {
              const result = await adminSetWorkspacePlanAction(
                workspaceId,
                currentPlan,
                nextInterval
              );
              if (result.ok) {
                toast({
                  title: "Billing interval updated",
                  description: `Workspace set to ${currentPlan} (${nextInterval}).`,
                });
                router.refresh();
              } else {
                toast({
                  variant: "destructive",
                  title: "Interval update failed",
                  description: result.error ?? "Please try again.",
                });
                setBillingInterval(normalizeBillingInterval(currentBillingInterval));
                router.refresh();
              }
            });
          }}
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </select>
      ) : null}
    </div>
  );
}
