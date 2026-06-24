"use client";

import type { BillingInterval } from "./pricingPlans";

type PricingBillingToggleProps = {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
};

export function PricingBillingToggle({ value, onChange }: PricingBillingToggleProps) {
  return (
    <div className="flex justify-center">
      <div
        className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 shadow-sm"
        role="tablist"
        aria-label="Billing interval"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === "monthly"}
          onClick={() => onChange("monthly")}
          className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors sm:px-6 ${
            value === "monthly"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "annual"}
          onClick={() => onChange("annual")}
          className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors sm:px-6 ${
            value === "annual"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-2">
            <span>Annual</span>
            <span
              className={`text-xs font-semibold ${
                value === "annual" ? "text-blue-100" : "text-blue-600"
              }`}
            >
              Save 2 months
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
