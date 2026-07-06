"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { trackToolUsed } from "@/lib/analytics/google";

export const AGING_BUCKETS = [
  {
    id: "current",
    label: "Current / Not due yet",
    field: "current",
    overdue: false,
  },
  {
    id: "1-30",
    label: "1–30 days overdue",
    field: "days1to30",
    overdue: true,
  },
  {
    id: "31-60",
    label: "31–60 days overdue",
    field: "days31to60",
    overdue: true,
  },
  {
    id: "61-90",
    label: "61–90 days overdue",
    field: "days61to90",
    overdue: true,
  },
  {
    id: "90-plus",
    label: "90+ days overdue",
    field: "days90Plus",
    overdue: true,
  },
] as const;

type BucketField = (typeof AGING_BUCKETS)[number]["field"];

type BucketAmounts = Record<BucketField, number>;

export type AgingRiskLevel =
  | "healthy"
  | "watch"
  | "high-risk"
  | "critical";

export type AgingBucketBreakdown = {
  id: string;
  label: string;
  amount: number;
  shareOfTotal: number;
  overdue: boolean;
};

export type InvoiceAgingResult = {
  totalReceivables: number;
  totalOverdue: number;
  overduePercentage: number;
  highestRiskBucket: AgingBucketBreakdown;
  breakdown: AgingBucketBreakdown[];
  riskLevel: AgingRiskLevel;
  interpretationTitle: string;
  interpretation: string;
};

function parseNonNegativeAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return parsed;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getRiskAssessment(overduePercentage: number): Pick<
  InvoiceAgingResult,
  "riskLevel" | "interpretationTitle" | "interpretation"
> {
  if (overduePercentage <= 15) {
    return {
      riskLevel: "healthy",
      interpretationTitle: "Healthy",
      interpretation:
        "Most receivables are current or only mildly overdue. Maintain consistent invoice tracking and reminder workflows to protect cash flow.",
    };
  }

  if (overduePercentage <= 30) {
    return {
      riskLevel: "watch",
      interpretationTitle: "Watch closely",
      interpretation:
        "A meaningful share of receivables is overdue. Review reminder timing, client follow-up, and collections priorities before balances age further.",
    };
  }

  if (overduePercentage <= 50) {
    return {
      riskLevel: "high-risk",
      interpretationTitle: "High risk",
      interpretation:
        "Overdue receivables are putting pressure on cash flow. Escalate follow-up on the largest aging buckets and tighten collections workflows.",
    };
  }

  return {
    riskLevel: "critical",
    interpretationTitle: "Critical collection risk",
    interpretation:
      "A large portion of receivables is overdue. Prioritize immediate collections activity on the highest-risk buckets to reduce write-off risk.",
  };
}

export function calculateInvoiceAging(amounts: BucketAmounts): InvoiceAgingResult | null {
  const breakdown: AgingBucketBreakdown[] = AGING_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    amount: amounts[bucket.field],
    shareOfTotal: 0,
    overdue: bucket.overdue,
  }));

  const totalReceivables = breakdown.reduce((sum, bucket) => sum + bucket.amount, 0);

  if (totalReceivables <= 0) {
    return null;
  }

  const totalOverdue = breakdown
    .filter((bucket) => bucket.overdue)
    .reduce((sum, bucket) => sum + bucket.amount, 0);

  const overduePercentage = (totalOverdue / totalReceivables) * 100;

  const breakdownWithShares = breakdown.map((bucket) => ({
    ...bucket,
    shareOfTotal: (bucket.amount / totalReceivables) * 100,
  }));

  const overdueBuckets = breakdownWithShares.filter((bucket) => bucket.overdue && bucket.amount > 0);
  const highestRiskBucket =
    overdueBuckets.length > 0
      ? overdueBuckets.reduce((max, bucket) => (bucket.amount > max.amount ? bucket : max))
      : breakdownWithShares.reduce((max, bucket) => (bucket.amount > max.amount ? bucket : max));

  return {
    totalReceivables,
    totalOverdue,
    overduePercentage,
    highestRiskBucket,
    breakdown: breakdownWithShares,
    ...getRiskAssessment(overduePercentage),
  };
}

const RISK_BADGE_CLASS: Record<AgingRiskLevel, string> = {
  healthy: "bg-emerald-50 text-emerald-800 border-emerald-200",
  watch: "bg-amber-50 text-amber-800 border-amber-200",
  "high-risk": "bg-orange-50 text-orange-800 border-orange-200",
  critical: "bg-rose-50 text-rose-800 border-rose-200",
};

const INITIAL_VALUES: Record<BucketField, string> = {
  current: "",
  days1to30: "",
  days31to60: "",
  days61to90: "",
  days90Plus: "",
};

export function InvoiceAgingCalculator() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<InvoiceAgingResult | null>(null);

  const hasAnyInput = useMemo(
    () => Object.values(values).some((value) => value.trim().length > 0),
    [values],
  );

  function handleChange(field: BucketField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleCalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: string[] = [];
    const amounts = {} as BucketAmounts;

    for (const bucket of AGING_BUCKETS) {
      const parsed = parseNonNegativeAmount(values[bucket.field]);
      if (parsed === null) {
        nextErrors.push(`Enter a valid amount for ${bucket.label}.`);
      } else {
        amounts[bucket.field] = parsed;
      }
    }

    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      setResult(null);
      return;
    }

    const nextResult = calculateInvoiceAging(amounts);

    if (!nextResult) {
      setErrors(["Enter at least one receivables amount greater than zero."]);
      setResult(null);
      return;
    }

    setResult(nextResult);
    trackToolUsed("invoice_aging_calculator");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleCalculate}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        noValidate
      >
        <h2 className="text-lg font-semibold text-slate-900">Receivables by aging bucket</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enter the outstanding invoice balance in each bucket. Leave a bucket blank if the amount
          is zero.
        </p>

        <div className="mt-6 space-y-5">
          {AGING_BUCKETS.map((bucket) => (
            <div key={bucket.id}>
              <label htmlFor={`aging-${bucket.id}`} className="block text-sm font-medium text-slate-900">
                {bucket.label}
              </label>
              <input
                id={`aging-${bucket.id}`}
                name={bucket.field}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={values[bucket.field]}
                onChange={(event) => handleChange(bucket.field, event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {errors.length > 0 ? (
          <ul
            className="mt-4 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}

        <Button type="submit" className="mt-6 w-full sm:w-auto">
          Calculate aging
        </Button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        {result ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Aging summary
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total receivables
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(result.totalReceivables)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total overdue
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(result.totalOverdue)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Overdue percentage
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatPercent(result.overduePercentage)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Highest-risk bucket
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {result.highestRiskBucket.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(result.highestRiskBucket.amount)}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-xl border px-4 py-3 ${RISK_BADGE_CLASS[result.riskLevel]}`}
            >
              <p className="text-sm font-semibold">{result.interpretationTitle}</p>
              <p className="mt-1 text-sm leading-relaxed">{result.interpretation}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">Aging breakdown</h3>
              <ul className="mt-4 space-y-3">
                {result.breakdown.map((bucket) => (
                  <li key={bucket.id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{bucket.label}</span>
                      <span className="shrink-0 text-slate-600">
                        {formatCurrency(bucket.amount)} · {formatPercent(bucket.shareOfTotal)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          bucket.overdue ? "bg-orange-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${bucket.shareOfTotal}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            {hasAnyInput
              ? "Calculate aging to see total receivables, overdue exposure, and bucket breakdown."
              : "Enter receivables by aging bucket to analyze overdue exposure and collection risk."}
          </p>
        )}
      </div>
    </div>
  );
}
