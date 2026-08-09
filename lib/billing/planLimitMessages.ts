/** Client-safe plan limit messages (no server imports). */

export type PlanLimitCode = "PLAN_LIMIT_INVOICES" | "PLAN_LIMIT_CLIENTS";

export const PLAN_LIMIT_CLIENTS_MESSAGE =
  "Client limit reached for your current plan. Upgrade your plan or archive unused clients.";

export const PLAN_LIMIT_INVOICES_MESSAGE =
  "Monthly invoice limit reached for your current plan. Upgrade your plan to create more invoices.";

export class PlanLimitError extends Error {
  code: PlanLimitCode;

  constructor(code: PlanLimitCode, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
  }
}
