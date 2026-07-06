import Clarity from "@microsoft/clarity";

/**
 * Microsoft Clarity analytics helpers.
 *
 * Project ID: set `NEXT_PUBLIC_CLARITY_PROJECT_ID` in production (from Clarity dashboard).
 * Clarity only initializes when NODE_ENV is `production` and the ID is present.
 *
 * Custom events: call `clarityEvent("event_name")` after a user action.
 * Optional identification: call `clarityIdentify(safeId)` — never pass email, names,
 * invoice numbers, payment amounts, workspace names, or other PII/financial data.
 */

let initialized = false;

/** Public Clarity project ID from `NEXT_PUBLIC_CLARITY_PROJECT_ID`. */
export function getClarityProjectId(): string | null {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!projectId) return null;
  return projectId;
}

/** True when Clarity should load (production + project ID). */
export function isClarityEnabled(): boolean {
  return process.env.NODE_ENV === "production" && getClarityProjectId() !== null;
}

/** Initialize Clarity once. Safe to call from a client useEffect. */
export function initClarity(): void {
  if (typeof window === "undefined" || initialized || !isClarityEnabled()) {
    return;
  }

  const projectId = getClarityProjectId();
  if (!projectId) {
    return;
  }

  Clarity.init(projectId);
  initialized = true;
}

/**
 * Associate a privacy-safe custom ID with the current session.
 * Do not pass email addresses, names, or financial/business identifiers.
 */
export function clarityIdentify(
  customId: string,
  customSessionId?: string,
  customPageId?: string,
  friendlyName?: string,
): void {
  if (!initialized || !isClarityEnabled()) {
    return;
  }

  Clarity.identify(customId, customSessionId, customPageId, friendlyName);
}

/** Track a named custom event in Clarity, e.g. `clarityEvent("pricing_viewed")`. */
export function clarityEvent(eventName: string): void {
  if (!initialized || !isClarityEnabled()) {
    return;
  }

  Clarity.event(eventName);
}
