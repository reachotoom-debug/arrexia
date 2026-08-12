import type { ActionResult } from "@/lib/actions/result";
import type { ClientFieldErrors } from "./clientPersistenceErrors";

export type ClientMutationResult =
  | Extract<ActionResult, { ok: true }>
  | {
      ok: false;
      message?: string;
      code?: string;
      fieldErrors?: ClientFieldErrors;
    };

export function clientFieldErrorResult(
  fieldErrors: ClientFieldErrors
): ClientMutationResult {
  return { ok: false, fieldErrors };
}
