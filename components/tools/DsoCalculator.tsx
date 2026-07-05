"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";

type DsoResult = {
  dso: number;
  interpretation: string;
};

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function calculateDso(
  netCreditSales: number,
  averageAccountsReceivable: number,
  numberOfDays: number,
): DsoResult {
  const dso = (averageAccountsReceivable / netCreditSales) * numberOfDays;

  let interpretation =
    "Your DSO reflects how long it takes to collect payment on credit sales during the period you measured.";

  if (dso <= 30) {
    interpretation =
      "A lower DSO generally indicates faster collections. Strong invoice tracking and timely payment reminders often help keep DSO low.";
  } else if (dso <= 45) {
    interpretation =
      "This DSO is moderate for many service businesses. Review overdue invoice management and reminder timing if cash flow feels tight.";
  } else {
    interpretation =
      "A higher DSO usually means slower collections. Consider tightening follow-up workflows, reminder sequences, and visibility into aging balances.";
  }

  return { dso, interpretation };
}

export function DsoCalculator() {
  const [netCreditSales, setNetCreditSales] = useState("");
  const [averageAccountsReceivable, setAverageAccountsReceivable] = useState("");
  const [numberOfDays, setNumberOfDays] = useState("365");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<DsoResult | null>(null);

  const formattedResult = useMemo(() => {
    if (!result) return null;
    return result.dso.toFixed(1);
  }, [result]);

  function handleCalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const sales = parsePositiveNumber(netCreditSales);
    const receivables = parsePositiveNumber(averageAccountsReceivable);
    const days = parsePositiveNumber(numberOfDays);
    const nextErrors: string[] = [];

    if (sales === null) {
      nextErrors.push("Enter a valid net credit sales amount greater than zero.");
    }

    if (receivables === null) {
      nextErrors.push("Enter a valid average accounts receivable amount greater than zero.");
    }

    if (days === null) {
      nextErrors.push("Enter a valid number of days greater than zero.");
    }

    setErrors(nextErrors);

    if (nextErrors.length > 0 || sales === null || receivables === null || days === null) {
      setResult(null);
      return;
    }

    setResult(calculateDso(sales, receivables, days));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <form
        onSubmit={handleCalculate}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        noValidate
      >
        <h2 className="text-lg font-semibold text-slate-900">Calculate DSO</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          DSO = (Average accounts receivable ÷ Net credit sales) × Number of days
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="net-credit-sales" className="block text-sm font-medium text-slate-900">
              Net credit sales
            </label>
            <p id="net-credit-sales-help" className="mt-1 text-xs text-slate-500">
              Total credit sales for the period, before returns or allowances.
            </p>
            <input
              id="net-credit-sales"
              name="netCreditSales"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={netCreditSales}
              onChange={(event) => setNetCreditSales(event.target.value)}
              aria-describedby="net-credit-sales-help"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="500000"
            />
          </div>

          <div>
            <label htmlFor="average-ar" className="block text-sm font-medium text-slate-900">
              Average accounts receivable
            </label>
            <p id="average-ar-help" className="mt-1 text-xs text-slate-500">
              Average AR balance during the same period.
            </p>
            <input
              id="average-ar"
              name="averageAccountsReceivable"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={averageAccountsReceivable}
              onChange={(event) => setAverageAccountsReceivable(event.target.value)}
              aria-describedby="average-ar-help"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="75000"
            />
          </div>

          <div>
            <label htmlFor="number-of-days" className="block text-sm font-medium text-slate-900">
              Number of days
            </label>
            <p id="number-of-days-help" className="mt-1 text-xs text-slate-500">
              Use 365 for annual periods, 90 for a quarter, or 30 for a month.
            </p>
            <input
              id="number-of-days"
              name="numberOfDays"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={numberOfDays}
              onChange={(event) => setNumberOfDays(event.target.value)}
              aria-describedby="number-of-days-help"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="365"
            />
          </div>
        </div>

        {errors.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}

        <Button type="submit" className="mt-6 w-full sm:w-auto">
          Calculate DSO
        </Button>
      </form>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Result</p>
          {formattedResult ? (
            <>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
                {formattedResult} days
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{result?.interpretation}</p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Enter your values and calculate to see days sales outstanding.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h3 className="text-lg font-semibold text-slate-900">
            Track invoices and reduce DSO with Arrexia
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Use invoice tracking, payment reminders, and overdue visibility to improve collections
            without adding accounting complexity.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={trialHref("starter")}>
              <Button className="w-full sm:w-auto">Start free trial</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="w-full sm:w-auto">
                View pricing
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
