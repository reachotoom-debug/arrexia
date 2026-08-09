"use client";

import { setWorkspacePlanAction } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useState, useTransition } from "react";
import { SettingsCard } from "./SettingsCard";
import {
  getBillingPlanCardCta,
  isSelfServiceBillingPlan,
  type SelfServiceBillingPlanId,
} from "@/lib/billing/billingPlanCardCta";
import {
  BILLING_UI_PLANS,
  formatMonthlyPrice,
  formatPlanLabel,
  getPlanDefinition,
  type PlanId,
  type WorkspacePlan,
} from "@/lib/billing/plans";
import type { TrialDisplayInfo } from "@/lib/billing/getWorkspacePlan";
import type { EntitlementState } from "@/lib/billing/resolveWorkspaceEntitlement";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";

export function BillingPlansClient({
  workspaceId,
  currentPlan,
  storedPlan,
  trial,
  entitlementState,
  paidPlan,
}: {
  workspaceId: string;
  currentPlan: WorkspacePlan;
  storedPlan: WorkspacePlan;
  trial: TrialDisplayInfo | null;
  entitlementState: EntitlementState;
  paidPlan: WorkspacePlan | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingPlanId, setPendingPlanId] = useState<SelfServiceBillingPlanId | null>(
    null
  );

  const billingContext = { entitlementState, paidPlan };

  const handlePlanChange = async (plan: SelfServiceBillingPlanId) => {
    const cta = getBillingPlanCardCta(billingContext, plan);
    if (!cta.canSubmit) {
      if (cta.disabledReason) {
        toast({
          variant: "destructive",
          title: "Plan change unavailable",
          description: cta.disabledReason,
        });
      }
      return;
    }

    setPendingPlanId(plan);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("workspaceId", workspaceId);
        formData.set("plan", plan);

        const result = await setWorkspacePlanAction(formData);

        if (result && typeof result === "object" && "ok" in result) {
          if (result.ok) {
            toast({
              title: "Plan updated",
              description:
                "message" in result && typeof result.message === "string"
                  ? result.message
                  : `Successfully switched to ${getPlanDefinition(plan).name}.`,
            });
            router.refresh();
          } else {
            toast({
              variant: "destructive",
              title: "Update failed",
              description: result.error || "Failed to update plan",
            });
          }
        } else {
          router.refresh();
        }
      } catch (error: unknown) {
        const digest = String((error as { digest?: string })?.digest || "");
        if (digest.includes("NEXT_REDIRECT")) {
          router.refresh();
          return;
        }

        console.error("[BillingPlansClient] plan update error:", error);
        toast({
          variant: "destructive",
          title: "Update failed",
          description:
            error instanceof Error ? error.message : "Failed to update plan",
        });
      } finally {
        setPendingPlanId(null);
      }
    });
  };

  return (
    <div className="w-full max-w-5xl">
      <SettingsCard>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Plans</h3>
          <p className="mt-1 text-xs text-slate-500">
            Choose the plan for this workspace. You can change plans anytime.
          </p>
          {trial?.status === "active" ? (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <p className="font-medium">Arrexia free trial</p>
              <p className="mt-0.5 text-blue-800">
                {trial.daysRemaining === 1
                  ? "1 day remaining"
                  : `${trial.daysRemaining} days remaining`}
                {trial.trialEndsAt
                  ? ` · Trial ends ${formatDateOnlyField(trial.trialEndsAt)}`
                  : null}
              </p>
            </div>
          ) : null}
          {trial?.status === "expired" ? (
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">Trial ended</p>
              <p className="mt-0.5">
                Your Arrexia trial has ended. Choose a paid plan below to continue making
                changes.
                {trial.trialEndsAt
                  ? ` Ended ${formatDateOnlyField(trial.trialEndsAt)}.`
                  : null}
              </p>
            </div>
          ) : null}
          {trial ? null : currentPlan !== "free" ? (
            <p className="mt-2 text-xs text-slate-600">
              Current workspace plan:{" "}
              <span className="font-medium text-slate-800">
                {getPlanDefinition(currentPlan).name}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Current effective plan: Free
              {storedPlan !== "free" ? ` (stored plan: ${formatPlanLabel(storedPlan)})` : ""}.
              Select Starter, Pro, or Business to upgrade.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {BILLING_UI_PLANS.map((planId) => {
            const plan = getPlanDefinition(planId);
            const selfServicePlan = isSelfServiceBillingPlan(planId)
              ? planId
              : null;
            const cta = selfServicePlan
              ? getBillingPlanCardCta(billingContext, selfServicePlan)
              : {
                  label: "Contact Sales",
                  disabled: true,
                  canSubmit: false,
                };
            const isSaving = isPending && pendingPlanId === selfServicePlan;
            const isDisabled = cta.disabled || (isPending && !isSaving);

            return (
              <div
                key={planId}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-semibold text-slate-900">
                      {plan.name}
                    </h4>
                    {plan.mostPopular ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xl font-semibold text-slate-900">
                    {formatMonthlyPrice(planId as PlanId)}
                  </div>
                  <p className="text-sm text-slate-600">{plan.description}</p>
                </div>

                <ul className="space-y-2 text-sm text-slate-700">
                  {plan.limits.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  title={cta.disabledReason ?? undefined}
                  onClick={() => {
                    if (selfServicePlan && cta.canSubmit) {
                      void handlePlanChange(selfServicePlan);
                    }
                  }}
                  disabled={isDisabled}
                  className={`mt-auto inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
                    isDisabled
                      ? "cursor-not-allowed bg-slate-200 text-slate-600"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isSaving ? "Saving..." : cta.label}
                </button>
              </div>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
