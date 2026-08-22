import type { BillingInterval } from "./plans";

/** Adds calendar months in UTC, clamping day-of-month to the month's last valid day. */
export function addCalendarMonthsUtc(start: Date, months: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(day, lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds()
    )
  );
}

/** Adds calendar years in UTC, clamping Feb 29 to Feb 28 in non-leap years. */
export function addCalendarYearsUtc(start: Date, years: number): Date {
  const year = start.getUTCFullYear() + years;
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds()
    )
  );
}

/** Computes paid subscription period end from a UTC instant start. */
export function computePaidPeriodEnd(start: Date, interval: BillingInterval): Date {
  if (interval === "annual") {
    return addCalendarYearsUtc(start, 1);
  }
  return addCalendarMonthsUtc(start, 1);
}

/** Computes manual renewal period timestamps for founder-admin mark renewed. */
export function computeManualRenewalPeriodUpdate(
  now: Date,
  input: {
    currentPeriodStartsAt: string | null | undefined;
    currentPeriodEndsAt: string | null | undefined;
    billingInterval: BillingInterval;
  }
): { currentPeriodStartsAt: string; currentPeriodEndsAt: string } {
  const interval = input.billingInterval;
  const periodEndMs = input.currentPeriodEndsAt
    ? Date.parse(input.currentPeriodEndsAt)
    : NaN;
  const periodStartAt = input.currentPeriodStartsAt ?? null;
  const periodStartMs = periodStartAt ? Date.parse(periodStartAt) : NaN;

  const isActiveEarlyRenewal =
    !Number.isNaN(periodEndMs) &&
    periodEndMs > now.getTime() &&
    periodStartAt !== null &&
    !Number.isNaN(periodStartMs);

  if (isActiveEarlyRenewal) {
    const existingEnd = new Date(periodEndMs);
    return {
      currentPeriodStartsAt: periodStartAt,
      currentPeriodEndsAt: computePaidPeriodEnd(existingEnd, interval).toISOString(),
    };
  }

  return {
    currentPeriodStartsAt: now.toISOString(),
    currentPeriodEndsAt: computePaidPeriodEnd(now, interval).toISOString(),
  };
}
