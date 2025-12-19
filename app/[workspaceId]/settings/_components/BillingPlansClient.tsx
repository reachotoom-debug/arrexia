"use client";

import { setWorkspacePlanAction } from "../actions";
import { useFormStatus } from "react-dom";

type PlanKey = "free" | "starter" | "pro";

const PLAN_DETAILS: Record<
  PlanKey,
  { price: string; description: string; limits: string[] }
> = {
  free: {
    price: "$0/mo",
    description: "For getting started and staying organized.",
    limits: ["5 invoices / month", "5 clients"],
  },
  starter: {
    price: "$15/mo",
    description: "Most popular for teams ready to automate follow-ups.",
    limits: ["100 invoices / month", "Unlimited clients"],
  },
  pro: {
    price: "$29/mo",
    description: "For teams needing control, history, and cockpit visibility.",
    limits: ["Unlimited invoices", "Unlimited clients"],
  },
};

function SubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`mt-auto inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
        disabled
          ? "bg-slate-200 text-slate-600"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

export function BillingPlansClient({
  workspaceId,
  currentPlan,
}: {
  workspaceId: string;
  currentPlan: "free" | "starter" | "pro";
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Billing</h2>
        <p className="text-sm text-slate-600">
          Choose the plan for this workspace. You can change plans anytime.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLAN_DETAILS) as PlanKey[]).map((plan) => {
          const detail = PLAN_DETAILS[plan];
          const isCurrent = currentPlan === plan;
          return (
            <form
              key={plan}
              action={setWorkspacePlanAction}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
            >
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="plan" value={plan} />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold capitalize text-slate-900">
                    {plan}
                  </h3>
                  {plan === "starter" ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <div className="text-xl font-semibold text-slate-900">
                  {detail.price}
                </div>
                <p className="text-sm text-slate-600">{detail.description}</p>
              </div>

              <ul className="space-y-2 text-sm text-slate-700">
                {detail.limits.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>

              <SubmitButton
                disabled={isCurrent}
                label={isCurrent ? "Current plan" : "Select plan"}
              />
            </form>
          );
        })}
      </div>
    </div>
  );
}
