/** Explicit durations opt out of the default lifetime, including for errors. */
export function getToastDuration(variant?: string | null, duration?: number): number {
  return duration ?? (variant === "destructive" ? Infinity : 4000);
}
