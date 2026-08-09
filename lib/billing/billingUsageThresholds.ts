export type UsageThresholdLevel = "normal" | "approaching" | "almost" | "reached";

export function getUsageThresholdLevel(
  used: number,
  limit: number | null
): UsageThresholdLevel {
  if (limit === null || limit <= 0) {
    return "normal";
  }

  const percent = (used / limit) * 100;
  if (percent >= 100) {
    return "reached";
  }
  if (percent >= 95) {
    return "almost";
  }
  if (percent >= 80) {
    return "approaching";
  }
  return "normal";
}

export function getUsageThresholdMessage(
  level: UsageThresholdLevel
): string | null {
  switch (level) {
    case "approaching":
      return "Approaching limit";
    case "almost":
      return "Almost at limit";
    case "reached":
      return "Limit reached";
    default:
      return null;
  }
}

export function getUsageProgressPercent(
  used: number,
  limit: number | null
): number {
  if (limit === null || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((used / limit) * 100));
}
