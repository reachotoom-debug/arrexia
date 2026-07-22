export const APPLICATION_FALLBACK_TIMEZONE = "UTC";

export const EMPTY_TIMESTAMP_PLACEHOLDER = "—";

const ADMIN_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const ADMIN_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;

  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveAdminDisplayTimeZone(explicitPreference?: string | null): string {
  if (explicitPreference && isValidTimeZone(explicitPreference)) {
    return explicitPreference;
  }

  if (typeof Intl !== "undefined") {
    try {
      const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTimeZone && isValidTimeZone(browserTimeZone)) {
        return browserTimeZone;
      }
    } catch {
      // fall through
    }
  }

  return APPLICATION_FALLBACK_TIMEZONE;
}

export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function resolveSafeTimeZone(timeZone: string | null | undefined): string {
  if (timeZone && isValidTimeZone(timeZone)) {
    return timeZone;
  }

  return APPLICATION_FALLBACK_TIMEZONE;
}

export function formatInstantInTimeZone(
  value: string | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = ADMIN_DATE_TIME_OPTIONS
): string {
  if (!value) return EMPTY_TIMESTAMP_PLACEHOLDER;

  const date = parseInstant(value);
  if (!date) return EMPTY_TIMESTAMP_PLACEHOLDER;

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: resolveSafeTimeZone(timeZone),
  }).format(date);
}

export function formatAdminDisplayDateTime(
  value: string | null | undefined,
  timeZone?: string | null
): string {
  return formatInstantInTimeZone(value, resolveSafeTimeZone(timeZone ?? APPLICATION_FALLBACK_TIMEZONE));
}

export function formatAdminDisplayDate(
  value: string | null | undefined,
  timeZone?: string | null
): string {
  return formatInstantInTimeZone(
    value,
    resolveSafeTimeZone(timeZone ?? APPLICATION_FALLBACK_TIMEZONE),
    ADMIN_DATE_OPTIONS
  );
}

/**
 * Formats calendar date strings (YYYY-MM-DD) without applying timezone offsets.
 * Use for invoice issue/due dates and other date-only business fields.
 */
export function formatDateOnlyField(value: string | null | undefined): string {
  if (!value) return EMPTY_TIMESTAMP_PLACEHOLDER;

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return EMPTY_TIMESTAMP_PLACEHOLDER;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return EMPTY_TIMESTAMP_PLACEHOLDER;
  }

  const calendarDate = new Date(year, month - 1, day);
  if (Number.isNaN(calendarDate.getTime())) {
    return EMPTY_TIMESTAMP_PLACEHOLDER;
  }

  return new Intl.DateTimeFormat("en-US", ADMIN_DATE_OPTIONS).format(calendarDate);
}

export function formatWorkspaceDisplayDateTime(
  value: string | null | undefined,
  workspaceTimeZone: string | null | undefined
): string {
  return formatInstantInTimeZone(value, resolveSafeTimeZone(workspaceTimeZone));
}

export function formatWorkspaceDisplayDate(
  value: string | null | undefined,
  workspaceTimeZone: string | null | undefined
): string {
  return formatInstantInTimeZone(
    value,
    resolveSafeTimeZone(workspaceTimeZone),
    ADMIN_DATE_OPTIONS
  );
}

/**
 * Maps an instant to a workspace-local calendar date (YYYY-MM-DD).
 * Used by orchestrators before pure reminder eligibility evaluation.
 */
export function instantToWorkspaceCalendarDate(
  instant: Date | string,
  workspaceTimeZone: string | null | undefined
): string | null {
  const date = instant instanceof Date ? instant : parseInstant(instant);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveSafeTimeZone(workspaceTimeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
