/**
 * Canonical workspace business-calendar contract.
 *
 * - Workspace Settings → timezone is authoritative for business dates.
 * - Date-only fields (YYYY-MM-DD) use timezone-neutral calendar arithmetic.
 * - UTC instants remain UTC in storage; map to workspace calendar only at boundaries.
 */

export {
  instantToWorkspaceCalendarDate as getWorkspaceCalendarDate,
  normalizeDateOnlyString,
} from "./formatDateTime";

export {
  addCalendarDays,
  differenceCalendarDays,
  parseCalendarDateString,
} from "@/lib/reminders/ruleTrigger";

import { instantToWorkspaceCalendarDate } from "./formatDateTime";

/** Maps an instant to the workspace-local calendar date (YYYY-MM-DD). */
export function getWorkspaceCalendarDateNow(
  workspaceTimeZone: string | null | undefined,
  instant: Date = new Date()
): string | null {
  return instantToWorkspaceCalendarDate(instant, workspaceTimeZone);
}

/** Resolves evaluation date for reminder/business logic from instant + workspace TZ. */
export function resolveWorkspaceEvaluationDate(
  evaluationInstant: Date,
  workspaceTimeZone: string | null | undefined
): string {
  return (
    instantToWorkspaceCalendarDate(evaluationInstant, workspaceTimeZone) ??
    evaluationInstant.toISOString().slice(0, 10)
  );
}
