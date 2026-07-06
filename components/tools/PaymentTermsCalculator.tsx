"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { trackToolUsed } from "@/lib/analytics/google";

export const PAYMENT_TERM_OPTIONS = [
  { id: "due_on_receipt", label: "Due on receipt", days: 0 },
  { id: "net_7", label: "Net 7", days: 7 },
  { id: "net_10", label: "Net 10", days: 10 },
  { id: "net_15", label: "Net 15", days: 15 },
  { id: "net_30", label: "Net 30", days: 30 },
  { id: "net_45", label: "Net 45", days: 45 },
  { id: "net_60", label: "Net 60", days: 60 },
  { id: "custom", label: "Custom days", days: null },
] as const;

export type PaymentTermId = (typeof PAYMENT_TERM_OPTIONS)[number]["id"];

export type PaymentStatus = "due-today" | "upcoming" | "overdue";

export type PaymentTermsResult = {
  dueDate: Date;
  dueDateLabel: string;
  paymentTermLabel: string;
  termDays: number;
  daysUntilDue: number;
  status: PaymentStatus;
  statusLabel: string;
  interpretationTitle: string;
  interpretation: string;
  longTermWarningTitle: string | null;
  longTermWarning: string | null;
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

function addDaysLocal(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function getTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffCalendarDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTodayForInput(): string {
  const today = getTodayLocal();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveTermDays(termId: PaymentTermId, customDays: number | null): number | null {
  const option = PAYMENT_TERM_OPTIONS.find((entry) => entry.id === termId);
  if (!option) return null;

  if (termId === "custom") {
    if (customDays === null || !Number.isInteger(customDays) || customDays < 0) {
      return null;
    }
    return customDays;
  }

  return option.days;
}

function buildPaymentTermLabel(termId: PaymentTermId, termDays: number): string {
  if (termId === "due_on_receipt") {
    return "Due on receipt";
  }

  if (termId === "custom") {
    return `Custom (Net ${termDays})`;
  }

  return `Net ${termDays}`;
}

function isLongPaymentTerm(termId: PaymentTermId, termDays: number): boolean {
  return termId === "net_45" || termId === "net_60" || (termId === "custom" && termDays > 45);
}

function getStatusDetails(daysUntilDue: number): Pick<
  PaymentTermsResult,
  "status" | "statusLabel" | "interpretationTitle" | "interpretation"
> {
  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return {
      status: "overdue",
      statusLabel: "Overdue",
      interpretationTitle: "Payment is overdue",
      interpretation:
        daysOverdue === 1
          ? "This invoice was due yesterday. Follow up with the customer and confirm when payment will arrive."
          : `This invoice is ${daysOverdue} days overdue. Prioritize collections follow-up to protect cash flow.`,
    };
  }

  if (daysUntilDue === 0) {
    return {
      status: "due-today",
      statusLabel: "Due today",
      interpretationTitle: "Due today",
      interpretation:
        "Payment is due today. Confirm receipt or send a polite reminder if you have not received payment yet.",
    };
  }

  return {
    status: "upcoming",
    statusLabel: "Upcoming",
    interpretationTitle: "Payment window active",
    interpretation:
      daysUntilDue === 1
        ? "Payment is due tomorrow. The invoice is still within its payment window—monitor the due date and send reminders if needed."
        : `Payment is due in ${daysUntilDue} days. The invoice is still within its payment window—track the due date and follow up as it approaches.`,
  };
}

function getLongTermWarning(termId: PaymentTermId, termDays: number): Pick<
  PaymentTermsResult,
  "longTermWarningTitle" | "longTermWarning"
> {
  if (!isLongPaymentTerm(termId, termDays)) {
    return {
      longTermWarningTitle: null,
      longTermWarning: null,
    };
  }

  return {
    longTermWarningTitle: "Long payment term warning",
    longTermWarning:
      "Extended payment terms delay cash collection and increase receivables risk. Consider shorter terms for new clients or pair longer terms with deposits and reminder workflows.",
  };
}

export function calculatePaymentTerms(input: {
  invoiceDateIso: string;
  termId: PaymentTermId;
  customDays: number | null;
  referenceDate?: Date;
}): PaymentTermsResult | null {
  const invoiceParts = parseIsoDateParts(input.invoiceDateIso);
  if (!invoiceParts) return null;

  const termDays = resolveTermDays(input.termId, input.customDays);
  if (termDays === null) return null;

  const invoiceDate = createLocalDate(invoiceParts);
  const dueDate = addDaysLocal(invoiceDate, termDays);
  const today = input.referenceDate ?? getTodayLocal();
  const daysUntilDue = diffCalendarDays(today, dueDate);

  return {
    dueDate,
    dueDateLabel: formatLocalDate(dueDate),
    paymentTermLabel: buildPaymentTermLabel(input.termId, termDays),
    termDays,
    daysUntilDue,
    ...getStatusDetails(daysUntilDue),
    ...getLongTermWarning(input.termId, termDays),
  };
}

const STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  "due-today": "bg-amber-50 text-amber-800 border-amber-200",
  upcoming: "bg-emerald-50 text-emerald-800 border-emerald-200",
  overdue: "bg-rose-50 text-rose-800 border-rose-200",
};

function parseCustomDays(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function PaymentTermsCalculator() {
  const [invoiceDate, setInvoiceDate] = useState(formatTodayForInput());
  const [termId, setTermId] = useState<PaymentTermId>("net_30");
  const [customDays, setCustomDays] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<PaymentTermsResult | null>(null);

  const showCustomDays = termId === "custom";

  const hasAnyInput = useMemo(
    () => invoiceDate.trim().length > 0 || customDays.trim().length > 0,
    [invoiceDate, customDays],
  );

  function handleCalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: string[] = [];

    if (!parseIsoDateParts(invoiceDate)) {
      nextErrors.push("Enter a valid invoice date.");
    }

    let resolvedCustomDays: number | null = null;
    if (termId === "custom") {
      resolvedCustomDays = parseCustomDays(customDays);
      if (resolvedCustomDays === null) {
        nextErrors.push("Enter a valid number of custom payment days (0 or greater).");
      }
    }

    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      setResult(null);
      return;
    }

    const nextResult = calculatePaymentTerms({
      invoiceDateIso: invoiceDate,
      termId,
      customDays: resolvedCustomDays,
    });

    if (!nextResult) {
      setErrors(["Unable to calculate due date from the provided inputs."]);
      setResult(null);
      return;
    }

    setResult(nextResult);
    trackToolUsed("payment_terms_calculator");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleCalculate}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        noValidate
      >
        <h2 className="text-lg font-semibold text-slate-900">Invoice and payment terms</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Enter the invoice date and payment terms to calculate the due date and payment status.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="invoice-date" className="block text-sm font-medium text-slate-900">
              Invoice date
            </label>
            <input
              id="invoice-date"
              name="invoiceDate"
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
              required
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-900">Payment terms</legend>
            <div className="mt-3 space-y-2">
              {PAYMENT_TERM_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
                >
                  <input
                    type="radio"
                    name="paymentTerms"
                    value={option.id}
                    checked={termId === option.id}
                    onChange={() => setTermId(option.id)}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {showCustomDays ? (
            <div>
              <label htmlFor="custom-days" className="block text-sm font-medium text-slate-900">
                Custom payment term days
              </label>
              <input
                id="custom-days"
                name="customDays"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={customDays}
                onChange={(event) => setCustomDays(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:border-blue-600 focus:ring-2"
                placeholder="e.g. 21"
              />
            </div>
          ) : null}
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
          Calculate due date
        </Button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        {result ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Payment terms summary
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Due date
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{result.dueDateLabel}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Payment term
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {result.paymentTermLabel}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Days until due
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {result.daysUntilDue}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Invoice status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{result.statusLabel}</p>
                </div>
              </div>
            </div>

            <div className={`rounded-xl border px-4 py-3 ${STATUS_BADGE_CLASS[result.status]}`}>
              <p className="text-sm font-semibold">{result.interpretationTitle}</p>
              <p className="mt-1 text-sm leading-relaxed">{result.interpretation}</p>
            </div>

            {result.longTermWarningTitle && result.longTermWarning ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900">
                <p className="text-sm font-semibold">{result.longTermWarningTitle}</p>
                <p className="mt-1 text-sm leading-relaxed">{result.longTermWarning}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            {hasAnyInput
              ? "Calculate due date to see payment term details and invoice status."
              : "Enter an invoice date and payment terms to calculate the due date and whether the invoice is upcoming, due today, or overdue."}
          </p>
        )}
      </div>
    </div>
  );
}
