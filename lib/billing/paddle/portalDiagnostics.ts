import "server-only";

import { getPaddleEnvironment } from "./env.server";

export type PortalFailureStage = "configuration_validation" | "client_initialization" |
  "portal_api_request" | "response_validation" | "subscription_lookup" | "workspace_access";

// Only fixed, non-sensitive API codes can cross the logging boundary.
const SAFE_CODES = new Set([
  "forbidden", "unauthorized", "authentication_missing", "authentication_malformed",
  "authentication_invalid", "authorization_error", "not_found", "bad_request",
  "request_error", "validation_error", "invalid_request", "too_many_requests",
  "internal_server_error", "service_unavailable",
]);

export function logPortalFailure(stage: PortalFailureStage, error?: unknown): void {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  console.error("[paddle/portal] failure", {
    environment: getPaddleEnvironment(),
    stage,
    errorCode: typeof code === "string" && SAFE_CODES.has(code) ? code : "unknown",
  });
  // The installed SDK's ApiError does not reliably retain HTTP status/request ID.
  // Do not infer them from an error message or log the error object/response.
}
