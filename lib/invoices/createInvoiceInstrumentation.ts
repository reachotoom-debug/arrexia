import "server-only";

import { randomUUID } from "node:crypto";

export type CreateInvoiceInstrumentation = {
  requestId: string;
  workspaceId: string;
  mark: (stage: string) => void;
  markError: (stage: string, error: unknown) => void;
};

export function isNextRedirectError(error: unknown): boolean {
  const digest = String((error as { digest?: string } | null)?.digest || "");
  return digest.includes("NEXT_REDIRECT");
}

export function createCreateInvoiceInstrumentation(
  workspaceId: string,
  requestId?: string
): CreateInvoiceInstrumentation {
  const resolvedRequestId = requestId ?? randomUUID();
  const startedAt = Date.now();

  const basePayload = () => ({
    requestId: resolvedRequestId,
    workspaceId,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    requestId: resolvedRequestId,
    workspaceId,
    mark(stage: string) {
      console.log(`[createInvoice] ${stage}`, basePayload());
    },
    markError(stage: string, error: unknown) {
      const err = error as {
        name?: string;
        code?: string;
        message?: string;
      } | null;
      console.error(`[createInvoice] ${stage}`, {
        ...basePayload(),
        errorName: err?.name,
        errorCode: err?.code,
        errorMessage: err?.message,
      });
    },
  };
}

export function createCreateInvoiceActionInstrumentation(
  workspaceId: string,
  requestId: string
): {
  requestId: string;
  mark: (stage: string) => void;
  markError: (stage: string, error: unknown) => void;
} {
  const startedAt = Date.now();

  const basePayload = () => ({
    requestId,
    workspaceId,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    requestId,
    mark(stage: string) {
      console.log(`[createInvoiceAction] ${stage}`, basePayload());
    },
    markError(stage: string, error: unknown) {
      const err = error as {
        name?: string;
        code?: string;
        message?: string;
      } | null;
      console.error(`[createInvoiceAction] ${stage}`, {
        ...basePayload(),
        errorName: err?.name,
        errorCode: err?.code,
        errorMessage: err?.message,
      });
    },
  };
}
