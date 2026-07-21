/**
 * Temporary server-side route profiling (P0-C).
 * Enable with ARREXIA_PERF=1 — logs to stdout only; never exposed to clients.
 * Remove after diagnosis (see docs/perf/P0-C-profiling.md).
 */

export function isPerfEnabled(): boolean {
  return process.env.ARREXIA_PERF === "1";
}

export function perfLog(scope: string, line: string): void {
  if (!isPerfEnabled()) return;
  console.log(`[perf][${scope}] ${line}`);
}

export async function perfTime<T>(
  scope: string,
  label: string,
  fn: () => Promise<T>,
  meta?: (result: T) => string
): Promise<T> {
  if (!isPerfEnabled()) {
    return fn();
  }

  const start = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - start);
    const suffix = meta ? ` ${meta(result)}` : "";
    perfLog(scope, `${label}=${ms}ms${suffix}`);
    return result;
  } catch (error) {
    const ms = Math.round(performance.now() - start);
    perfLog(scope, `${label}=${ms}ms status=error`);
    throw error;
  }
}

export function createRoutePerf(scope: string) {
  const routeStart = performance.now();

  return {
    async time<T>(
      label: string,
      fn: () => Promise<T>,
      meta?: (result: T) => string
    ): Promise<T> {
      return perfTime(scope, label, fn, meta);
    },

    finish(extra?: Record<string, string | number | boolean | null | undefined>): void {
      if (!isPerfEnabled()) return;
      const totalMs = Math.round(performance.now() - routeStart);
      const parts = extra
        ? Object.entries(extra)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`)
            .join(" ")
        : "";
      perfLog(scope, parts ? `total=${totalMs}ms ${parts}` : `total=${totalMs}ms`);
    },
  };
}
