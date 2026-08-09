import {
  EntitlementError,
  TRIAL_CLIENT_LIMIT_MESSAGE,
  TRIAL_EXPIRED_MESSAGE,
  TRIAL_INVOICE_LIMIT_MESSAGE,
} from "./entitlementErrors";
import { PlanLimitError, PLAN_LIMIT_CLIENTS_MESSAGE, PLAN_LIMIT_INVOICES_MESSAGE } from "./assertWithinPlanLimits";

export function isEntitlementOrPlanLimitError(error: unknown): error is EntitlementError | PlanLimitError {
  return error instanceof EntitlementError || error instanceof PlanLimitError;
}

export function entitlementErrorMessage(error: EntitlementError | PlanLimitError): string {
  if (error instanceof EntitlementError) {
    return error.message;
  }
  if (error.code === "PLAN_LIMIT_CLIENTS") {
    return PLAN_LIMIT_CLIENTS_MESSAGE;
  }
  return PLAN_LIMIT_INVOICES_MESSAGE;
}

export function entitlementErrorCode(error: EntitlementError | PlanLimitError): string {
  return error.code;
}

export { TRIAL_EXPIRED_MESSAGE, TRIAL_CLIENT_LIMIT_MESSAGE, TRIAL_INVOICE_LIMIT_MESSAGE };
