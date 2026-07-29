import { resolveSafeTimeZone } from "@/lib/datetime/formatDateTime";

/** Extract a display-safe first name from profile full_name. Never returns email-like values. */
export function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed || trimmed.includes("@")) return null;

  const first = trimmed.split(/\s+/)[0];
  if (!first || first.includes("@")) return null;

  return first;
}

function resolveTimeOfDayPhrase(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/**
 * Workspace-local greeting for the Action Center header.
 * Falls back to "Good morning" when no first name is available.
 */
export function buildActionCenterGreeting(params: {
  fullName?: string | null;
  workspaceTimeZone?: string | null;
  now?: Date;
}): string {
  const firstName = extractFirstName(params.fullName);
  const timeZone = resolveSafeTimeZone(params.workspaceTimeZone);
  const now = params.now ?? new Date();

  let hour = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  } catch {
    hour = now.getUTCHours();
  }

  const timePhrase = resolveTimeOfDayPhrase(hour);
  const salutation = `Good ${timePhrase}`;

  if (!firstName) {
    return salutation;
  }

  return `${salutation}, ${firstName}`;
}
