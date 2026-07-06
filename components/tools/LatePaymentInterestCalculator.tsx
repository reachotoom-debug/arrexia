"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { trackToolUsed } from "@/lib/analytics/google";

export const LATE_FEE_APPLIES_WHEN_OVERDUE =
  "Fixed late fee applies only when the invoice is overdue.";

export const ESTIMATION_DISCLAIMER =
  "This calculator is for estimation only and does not provide legal or financial advice. Late payment fees and interest may depend on your contract, jurisdiction, and local regulations.";

export type LateChargeLevel = "not-overdue" | "low" | "moderate" | "high";

export type LatePaymentInterestResult = {
  daysOverdue: number;
  interestAmount: number;
  fixedLateFee: number;
  totalLateCharges: number;
  totalAmountDue: number;
  dailyInterestAmount: number;
  statusLabel: string;
  chargeLevel: LateChargeLevel;
  interpretationTitle: string;
  interpretation: string;
  regulatoryNote: string | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function createLocalDate(parts: DateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day);
}

function diffCalendarDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function formatTodayForInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parsePositiveAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function parseNonNegativeAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return parsed;
}

function parseNonNegativeRate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return parsed;
}

function getChargeAssessment(
  invoiceAmount: number,
  totalLateCharges: number,
  daysOverdue: number,
): Pick<
  LatePaymentInterestResult,
  "chargeLevel" | "interpretationTitle" | "interpretation" | "regulatoryNote" | "statusLabel"
> {
  if (daysOverdue <= 0) {
    return {
      statusLabel: "Not overdue",
      chargeLevel: "not-overdue",
      interpretationTitle: "Not overdue",
      interpretation:
        "Payment is on or before the due date, so no late interest or overdue late fee applies under these inputs.",
      regulatoryNote: null,
    };
  }

  const chargeShare = invoiceAmount > 0 ? (totalLateCharges / invoiceAmount) * 100 : 0;

  let chargeLevel: LateChargeLevel = "high";
  let interpretationTitle = "High late charge";
  let interpretation =
    "Late charges are a meaningful share of the invoice. Confirm contract terms, communicate clearly with the customer, and prioritize collection follow-up.";

  if (chargeShare <= 2) {
    chargeLevel = "low";
    interpretationTitle = "Low late charge";
    interpretation =
      "Estimated late charges are relatively small compared to the invoice amount. Still confirm your contract allows interest and fees before invoicing them.";
  } else if (chargeShare <= 10) {
    chargeLevel = "moderate";
    interpretationTitle = "Moderate late charge";
    interpretation =
      "Late charges are becoming material. Document the overdue period, verify permitted rates and fees, and follow up promptly on payment.";
  }

  return {
    statusLabel: "Overdue",
    chargeLevel,
    interpretationTitle,
    interpretation,
    regulatoryNote: "Review contract or local regulations before charging interest.",
  };
}

export function calculateLatePaymentInterest(input: {
  invoiceAmount: number;
  dueDateIso: string;
  paymentDateIso: string;
  annualInterestRatePercent: number;
  fixedLateFee: number;
}): LatePaymentInterestResult | null {
  const dueParts = parseIsoDateParts(input.dueDateIso);
  const paymentParts = parseIsoDateParts(input.paymentDateIso);

  if (!dueParts || !paymentParts) {
    return null;
  }

  if (
    !Number.isFinite(input.invoiceAmount) ||
    input.invoiceAmount <= 0 ||
    !Number.isFinite(input.annualInterestRatePercent) ||
    input.annualInterestRatePercent < 0 ||
    !Number.isFinite(input.fixedLateFee) ||
    input.fixedLateFee < 0
  ) {
    return null;
  }

  const dueDate = createLocalDate(dueParts);
  const paymentDate = createLocalDate(paymentParts);
  const daysOverdue = Math.max(0, diffCalendarDays(dueDate, paymentDate));

  const dailyInterestAmount =
    (input.invoiceAmount * (input.annualInterestRatePercent / 100)) / 365;

  if (daysOverdue === 0) {
    return {
      daysOverdue: 0,
      interestAmount: 0,
      fixedLateFee: 0,
      totalLateCharges: 0,
      totalAmountDue: input.invoiceAmount,
      dailyInterestAmount: 0,
      ...getChargeAssessment(input.invoiceAmount, 0, 0),
    };
  }

  const interestAmount = dailyInterestAmount * daysOverdue;
  const fixedLateFee = input.fixedLateFee;
  const totalLateCharges = interestAmount + fixedLateFee;
  const totalAmountDue = input.invoiceAmount + totalLateCharges;

  return {
    daysOverdue,
    interestAmount,
    fixedLateFee,
    totalLateCharges,
    totalAmountDue,
    dailyInterestAmount,
    ...getChargeAssessment(input.invoiceAmount, totalLateCharges, daysOverdue),
  };
}

const CHARGE_BADGE_CLASS: Record<LateChargeLevel, string> = {
  "not-overdue": "bg-emerald-50 text-emerald-800 border-emerald-200",
  low: "bg-blue-50 text-blue-800 border-blue-200",
  moderate: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
};

export function LatePaymentInterestCalculator() {
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [dueDate, setDueDate] = useState(formatTodayForInput());
  const [paymentDate, setPaymentDate] = useState(formatTodayForInput());
  const [annualInterestRate, setAnnualInterestRate] = useState("8");
  const [fixedLateFee, setFixedLateFee] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<LatePaymentInterestResult | null>(null);

  const hasAnyInput = useMemo(
    () =>
      invoiceAmount.trim().length > 0 ||
      fixedLateFee.trim().length > 0 ||
      annualInterestRate.trim().length > 0,
    [invoiceAmount, fixedLateFee, annualInterestRate],
  );

  function handleCalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: string[] = [];

    const parsedInvoiceAmount = parsePositiveAmount(invoiceAmount);
    if (parsedInvoiceAmount === null) {
      nextErrors.push("Enter a valid invoice amount greater than zero.");
    }

    if (!parseIsoDateParts(dueDate)) {
      nextErrors.push("Enter a valid due date.");
    }

    if (!parseIsoDateParts(paymentDate)) {
      nextErrors.push("Enter a valid payment or expected payment date.");
    }

    const parsedRate = parseNonNegativeRate(annualInterestRate);
    if (parsedRate === null) {
      nextErrors.push("Enter a valid annual interest rate (0 or greater).");
    }

    const parsedLateFee = parseNonNegativeAmount(fixedLateFee);
    if (parsedLateFee === null) {
      nextErrors.push("Enter a valid fixed late fee (0 or greater), or leave it blank.");
    }

    setErrors(nextErrors);

    if (nextErrors.length > 0 || parsedInvoiceAmount === null || parsedRate === null || parsedLateFee === null) {
      setResult(null);
      return;
    }

    const nextResult = calculateLatePaymentInterest({
      invoiceAmount: parsedInvoiceAmount,
      dueDateIso: dueDate,
      paymentDateIso: paymentDate,
      annualInterestRatePercent: parsedRate,
      fixedLateFee: parsedLateFee,
    });

    if (!nextResult) {
      setErrors(["Unable to calculate late payment interest from the provided inputs."]);
      setResult(null);
      return;
    }

    setResult(nextResult);
    trackToolUsed("late_payment_interest_calculator");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleCalculate}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        noValidate
      >
        <h2 className="text-lg font-semibold text-slate-900">Invoice and late payment details</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enter the invoice amount, due date, payment date, annual interest rate, and optional
          fixed late fee to estimate overdue interest.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="invoice-amount" className="block text-sm font-medium text-slate-900">
              Invoice amount
            </label>
            <input
              id="invoice-amount"
              name="invoiceAmount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={invoiceAmount}
              onChange={(event) => setInvoiceAmount(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="5000"
            />
          </div>

          <div>
            <label htmlFor="due-date" className="block text-sm font-medium text-slate-900">
              Due date
            </label>
            <input
              id="due-date"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              required
            />
          </div>

          <div>
            <label htmlFor="payment-date" className="block text-sm font-medium text-slate-900">
              Payment date / expected payment date
            </label>
            <input
              id="payment-date"
              name="paymentDate"
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              required
            />
          </div>

          <div>
            <label htmlFor="interest-rate" className="block text-sm font-medium text-slate-900">
              Annual interest rate (%)
            </label>
            <input
              id="interest-rate"
              name="annualInterestRate"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={annualInterestRate}
              onChange={(event) => setAnnualInterestRate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="8"
            />
          </div>

          <div>
            <label htmlFor="fixed-late-fee" className="block text-sm font-medium text-slate-900">
              Fixed late fee (optional)
            </label>
            <input
              id="fixed-late-fee"
              name="fixedLateFee"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fixedLateFee}
              onChange={(event) => setFixedLateFee(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              placeholder="0"
            />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{LATE_FEE_APPLIES_WHEN_OVERDUE}</p>
          </div>
        </div>

        <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          {ESTIMATION_DISCLAIMER}
        </p>

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
          Calculate late charges
        </Button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        {result ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Late payment summary
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{result.statusLabel}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Days overdue
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{result.daysOverdue}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Interest amount
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatCurrency(result.interestAmount)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Fixed late fee
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatCurrency(result.fixedLateFee)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total late charges
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatCurrency(result.totalLateCharges)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Daily interest amount
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatCurrency(result.dailyInterestAmount)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total amount due
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(result.totalAmountDue)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Includes original invoice amount plus late charges
                  </p>
                </div>
              </div>
            </div>

            <div className={`rounded-xl border px-4 py-3 ${CHARGE_BADGE_CLASS[result.chargeLevel]}`}>
              <p className="text-sm font-semibold">{result.interpretationTitle}</p>
              <p className="mt-1 text-sm leading-relaxed">{result.interpretation}</p>
            </div>

            {result.regulatoryNote ? (
              <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800">
                <p className="text-sm font-semibold">{result.regulatoryNote}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Confirm permitted rates, notice requirements, and fee caps in your agreement and
                  applicable law before adding interest to a customer invoice.
                </p>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-slate-500">{ESTIMATION_DISCLAIMER}</p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            {hasAnyInput
              ? "Calculate late charges to see days overdue, interest, fees, and total amount due."
              : "Enter invoice details to estimate late payment interest and optional overdue fees."}
          </p>
        )}
      </div>
    </div>
  );
}
