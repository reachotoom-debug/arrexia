"use client";



import Link from "next/link";

import { useState } from "react";

import { PricingBillingToggle } from "@/components/pricing/PricingBillingToggle";

import { PaddleCheckoutButton } from "@/components/billing/PaddleCheckoutButton";

import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";

import { SettingsCard } from "./SettingsCard";

import {

  getBillingPlanCardCta,

  isSelfServiceBillingPlan,

} from "@/lib/billing/billingPlanCardCta";

import type { CommercialSubscriptionPresentation } from "@/lib/billing/commercialSubscriptionPresentation";

import {

  getUsageProgressPercent,

  getUsageThresholdLevel,

  getUsageThresholdMessage,

} from "@/lib/billing/billingUsageThresholds";

import type { BillingUsageSummary } from "@/lib/billing/billingUsageTypes";

import {

  BILLING_UI_PLANS,

  formatBillingIntervalLabel,

  formatPaidSubscriptionPrice,

  getBillingUiPlanLimits,

  getPlanDefinition,

  getPublicPlanPricing,

  type BillingInterval,

  type PlanId,

  type WorkspacePlan,

} from "@/lib/billing/plans";

import type { TrialDisplayInfo } from "@/lib/billing/getWorkspacePlan";

import type { EntitlementState } from "@/lib/billing/resolveWorkspaceEntitlement";

import { formatPaidSubscriptionPeriodEndMessage } from "@/lib/billing/paidSubscriptionPeriodEndLabel";

import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";



const CHECKOUT_PENDING_ACTIVATION_MESSAGE =

  "Checkout is connected in sandbox. Your Arrexia plan activates after Paddle webhook confirmation.";



function thresholdBarClass(level: ReturnType<typeof getUsageThresholdLevel>): string {

  switch (level) {

    case "reached":

      return "bg-red-500";

    case "almost":

      return "bg-amber-500";

    case "approaching":

      return "bg-yellow-500";

    default:

      return "bg-blue-600";

  }

}



function UsageMeterCard({

  label,

  used,

  limit,

  remainingCopy,

  periodLabel,

  unlimited,

}: {

  label: string;

  used: number;

  limit: number | null;

  remainingCopy: string;

  periodLabel?: string;

  unlimited: boolean;

}) {

  const thresholdLevel = unlimited ? "normal" : getUsageThresholdLevel(used, limit);

  const thresholdMessage = unlimited ? null : getUsageThresholdMessage(thresholdLevel);

  const progress = unlimited ? 0 : getUsageProgressPercent(used, limit);



  return (

    <div className="rounded-lg border border-slate-200 p-4">

      <div className="flex items-start justify-between gap-3">

        <div>

          <p className="text-sm font-medium text-slate-900">{label}</p>

          {periodLabel ? (

            <p className="mt-0.5 text-xs text-slate-500">{periodLabel}</p>

          ) : null}

        </div>

        {thresholdMessage ? (

          <span className="shrink-0 text-xs font-medium text-amber-700">{thresholdMessage}</span>

        ) : null}

      </div>



      <p className="mt-3 text-lg font-semibold text-slate-900">

        {unlimited ? (

          "Unlimited"

        ) : (

          <>

            {used} / {limit}

          </>

        )}

      </p>



      {!unlimited ? (

        <>

          <p className="mt-1 text-xs text-slate-500">{remainingCopy}</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">

            <div

              className={`h-full rounded-full transition-all ${thresholdBarClass(thresholdLevel)}`}

              style={{ width: `${progress}%` }}

            />

          </div>

        </>

      ) : (

        <p className="mt-1 text-xs text-slate-500">{remainingCopy}</p>

      )}

    </div>

  );

}



export function BillingPlansClient({

  workspaceId,

  paddleCheckoutCustomer,

  canManageSubscription,

  subscription,

  trial,

  entitlementState,

  paidPlan,

  paidBillingInterval,

  paidPeriodEndsAt,

  paidCancelAtPeriodEnd,

  usageSummary,

}: {

  workspaceId: string;

  paddleCheckoutCustomer:
    | {
        available: true;
        customerId: string | null;
        customerEmail: string | null;
      }
    | {
        available: false;
        unavailableReason: string;
      };

  canManageSubscription: boolean;

  subscription: CommercialSubscriptionPresentation;

  trial: TrialDisplayInfo | null;

  entitlementState: EntitlementState;

  paidPlan: WorkspacePlan | null;

  paidBillingInterval: BillingInterval | null;

  paidPeriodEndsAt: string | null;

  paidCancelAtPeriodEnd: boolean;

  usageSummary: BillingUsageSummary;

}) {

  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const billingContext = { entitlementState, paidPlan };

  const activePaidPlan = entitlementState === "paid" ? paidPlan : null;

  const paidPrice =

    activePaidPlan !== null && paidBillingInterval

      ? formatPaidSubscriptionPrice(activePaidPlan, paidBillingInterval)

      : null;

  const paidIntervalLabel =

    activePaidPlan !== null && paidBillingInterval

      ? formatBillingIntervalLabel(paidBillingInterval)

      : null;



  return (

    <div className="w-full max-w-5xl space-y-6">

      <SettingsCard title="Current subscription">

        <div className="space-y-3">

          <div className="flex flex-wrap items-start justify-between gap-3">

            <div>

              <p className="text-base font-semibold text-slate-900">{subscription.planLabel}</p>

              {paidIntervalLabel ? (

                <p className="mt-0.5 text-sm text-slate-600">{paidIntervalLabel}</p>

              ) : null}

              <p className="mt-0.5 text-sm text-slate-600">{subscription.statusLabel}</p>

              {paidPeriodEndsAt ? (

                <p className="mt-0.5 text-sm text-slate-600">

                  {formatPaidSubscriptionPeriodEndMessage(
                    paidPeriodEndsAt,
                    paidCancelAtPeriodEnd
                  )}

                </p>

              ) : null}

            </div>

            {paidPrice ? (

              <p className="text-sm font-medium text-slate-700">{paidPrice}</p>

            ) : null}

          </div>



          {trial?.status === "active" ? (

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">

              <p>

                {trial.daysRemaining === 1

                  ? "1 day remaining"

                  : `${trial.daysRemaining} days remaining`}

              </p>

              {trial.trialEndsAt ? (

                <p className="mt-0.5 text-blue-800">

                  Ends {formatDateOnlyField(trial.trialEndsAt)}

                </p>

              ) : null}

            </div>

          ) : null}



          {entitlementState === "trial_expired" ? (

            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">

              <p className="font-medium">Trial expired</p>

              <p className="mt-1">

                Your data remains available, but creating or changing collection data requires a

                paid plan.

              </p>

              {trial?.trialEndsAt ? (

                <p className="mt-1 text-amber-800">

                  Ended {formatDateOnlyField(trial.trialEndsAt)}

                </p>

              ) : null}

            </div>

          ) : null}

          {canManageSubscription ? (
            <div>
              <ManageSubscriptionButton workspaceId={workspaceId} />
            </div>
          ) : null}

        </div>

      </SettingsCard>



      {usageSummary.meters.length > 0 ? (

        <SettingsCard title="Usage">

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

            {usageSummary.meters.map((meter) => (

              <UsageMeterCard

                key={meter.id}

                label={meter.label}

                used={meter.used}

                limit={meter.limit}

                remainingCopy={meter.remainingCopy}

                periodLabel={meter.periodLabel}

                unlimited={meter.unlimited}

              />

            ))}

          </div>

        </SettingsCard>

      ) : null}



      <SettingsCard title="Available plans">

        <p className="text-sm text-slate-600">

          Choose a paid plan below. Your Arrexia subscription activates after Paddle confirms

          payment.

        </p>



        <div className="mt-4 flex justify-start">

          <PricingBillingToggle value={billingInterval} onChange={setBillingInterval} />

        </div>



        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">

          {BILLING_UI_PLANS.map((planId) => {

            const plan = getPlanDefinition(planId);

            const selfServicePlan = isSelfServiceBillingPlan(planId) ? planId : null;

            const cta = selfServicePlan

              ? getBillingPlanCardCta(billingContext, selfServicePlan)

              : {

                  label: "Contact Sales",

                  disabled: false,

                  canSubmit: false,

                  action: "contact" as const,

                  href: "/contact",

                };

            const pricing =

              selfServicePlan !== null

                ? getPublicPlanPricing(selfServicePlan, billingInterval)

                : null;



            return (

              <div

                key={planId}

                className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4"

              >

                <div className="space-y-1">

                  <div className="flex items-center gap-2">

                    <h4 className="text-base font-semibold text-slate-900">{plan.name}</h4>

                    {plan.mostPopular ? (

                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">

                        Most popular

                      </span>

                    ) : null}

                  </div>

                  <div className="text-xl font-semibold text-slate-900">

                    {pricing ? (

                      <>

                        {pricing.price}

                        <span className="text-base font-medium text-slate-600">{pricing.period}</span>

                      </>

                    ) : null}

                  </div>

                  {pricing?.equivalentSubtext ? (

                    <p className="text-xs text-slate-500">{pricing.equivalentSubtext}</p>

                  ) : null}

                  <p className="text-sm text-slate-600">{plan.description}</p>

                </div>



                <ul className="space-y-2 text-sm text-slate-700">

                  {getBillingUiPlanLimits(planId).map((line) => (

                    <li key={line}>• {line}</li>

                  ))}

                </ul>



                {cta.action === "checkout" && selfServicePlan ? (

                  <PaddleCheckoutButton

                    plan={selfServicePlan}

                    interval={billingInterval}

                    workspaceId={workspaceId}

                    customerId={
                      paddleCheckoutCustomer.available
                        ? paddleCheckoutCustomer.customerId
                        : null
                    }

                    customerEmail={
                      paddleCheckoutCustomer.available
                        ? paddleCheckoutCustomer.customerEmail
                        : null
                    }

                    label={cta.label}

                    disabled={
                      cta.disabled ||
                      !paddleCheckoutCustomer.available
                    }

                    disabledReason={
                      !paddleCheckoutCustomer.available
                        ? paddleCheckoutCustomer.unavailableReason
                        : cta.disabledReason
                    }

                  />

                ) : cta.href ? (

                  <Link

                    href={cta.href}

                    className="mt-auto inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"

                  >

                    {cta.label}

                  </Link>

                ) : (

                  <button

                    type="button"

                    title={cta.disabledReason ?? undefined}

                    disabled

                    className="mt-auto inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm"

                  >

                    {cta.label}

                  </button>

                )}

              </div>

            );

          })}

        </div>



        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">

          <h4 className="text-sm font-semibold text-slate-900">Enterprise</h4>

          <p className="mt-1 text-sm text-slate-600">

            Custom terms, security review, and volume pricing for larger organizations.

          </p>

          <Link

            href="/contact"

            className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"

          >

            Contact Sales

          </Link>

        </div>

      </SettingsCard>



      <SettingsCard title="Billing management">

        <p className="text-sm text-slate-600">{CHECKOUT_PENDING_ACTIVATION_MESSAGE}</p>

        {entitlementState === "trial_expired" ? (

          <p className="mt-3 text-sm text-slate-600">

            Subscribe to a plan above to restore full workspace access after payment confirmation.

          </p>

        ) : null}

      </SettingsCard>

    </div>

  );

}


