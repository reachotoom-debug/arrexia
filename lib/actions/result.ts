/**
 * Standardized ActionResult type for server actions
 * 
 * Server actions should return ActionResult instead of calling redirect().
 * This eliminates NEXT_REDIRECT false errors and provides consistent error handling.
 */

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; message: string; code?: string };

/**
 * Create a successful result, optionally with a redirect URL
 */
export function ok(redirectTo?: string): ActionResult {
  return { ok: true, redirectTo };
}

/**
 * Create a failed result with an error message and optional error code
 */
export function fail(message: string, code?: string): ActionResult {
  return { ok: false, message, code };
}
