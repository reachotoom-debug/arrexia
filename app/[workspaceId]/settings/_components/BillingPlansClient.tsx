"use client";

import { setWorkspacePlanAction } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useTransition } from "react";
import { SettingsCard } from "./SettingsCard";
import {
  BILLING_UI_PLANS,
  formatMonthlyPrice,
  getPlanDefinition,
  type WorkspacePlan,
} from "@/lib/billing/plans";

export function BillingPlansClient({
  workspaceId,
  currentPlan,
}: {
  workspaceId: string;
  currentPlan: WorkspacePlan;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handlePlanChange = async (plan: WorkspacePlan) => {
    if (plan === currentPlan) return;

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
              description: `Successfully switched to ${getPlanDefinition(plan).name}.`,
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
          {currentPlan !== "free" ? (
            <p className="mt-2 text-xs text-slate-600">
              Current workspace plan:{" "}
              <span className="font-medium text-slate-800">
                {getPlanDefinition(currentPlan).name}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Current workspace plan: Free (trial). Select Starter or Pro to upgrade.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {BILLING_UI_PLANS.map((planId) => {
            const plan = getPlanDefinition(planId);
            const isCurrent = currentPlan === planId;
            const isDisabled = plan.comingSoon || !plan.selectableInBilling;

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
                    {plan.comingSoon ? (
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        Coming soon
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xl font-semibold text-slate-900">
                    {formatMonthlyPrice(planId)}
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
                  onClick={() => {
                    if (planId === "starter" || planId === "pro") {
                      void handlePlanChange(planId);
                    }
                  }}
                  disabled={isCurrent || isPending || isDisabled}
                  className={`mt-auto inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
                    isCurrent || isPending || isDisabled
                      ? "cursor-not-allowed bg-slate-200 text-slate-600"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isPending
                    ? "Saving..."
                    : isCurrent
                      ? "Current plan"
                      : plan.comingSoon
                        ? "Coming soon"
                        : "Select plan"}
                </button>
              </div>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
