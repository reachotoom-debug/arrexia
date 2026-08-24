type RpcErrorLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export type PaymentManualActionError = {
  error: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const EXPECTED_UPDATE_OVERPAY_MESSAGE =
  "Payment exceeds the invoice outstanding balance.";

function normalizeRpcMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function mapPaymentManualRpcBase(rpcError: RpcErrorLike, actionLabel: string): PaymentManualActionError {
  const message = normalizeRpcMessage(rpcError.message ?? `Failed to ${actionLabel} payment`);
  const code = rpcError.code;

  if (code === "23505" || message.includes("transaction reference already exists")) {
    return {
      error:
        "A payment with this transaction reference already exists in this workspace.",
      code: "23505",
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (
    message.includes("would result in overpayment") ||
    message.includes("exceeds the invoice outstanding balance")
  ) {
    return {
      error: EXPECTED_UPDATE_OVERPAY_MESSAGE,
      code: code ?? "P0001",
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (message === "Payment not found" || message.startsWith("Payment not found:")) {
    return {
      error: message.startsWith("Payment not found:")
        ? message
        : `Payment not found: ${message}`,
      code,
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (message === "Invoice not found" || message.startsWith("Invoice not found:")) {
    return {
      error: message.startsWith("Invoice not found:")
        ? message
        : `Invoice not found: ${message}`,
      code,
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (message === "Client not found" || message.startsWith("Client not found:")) {
    return {
      error: message.startsWith("Client not found:")
        ? message
        : `Client not found: ${message}`,
      code,
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (message === "Not authenticated" || message === "Not a workspace member") {
    return {
      error: message,
      code: code ?? "42501",
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  if (
    message === "Cannot change client for an existing payment" ||
    message === "Cannot change invoice for an existing payment" ||
    message === "Invalid payment: missing invoice_id" ||
    message === "Amount must be positive" ||
    message === "payment_date is required" ||
    message === "workspace_id and payment_id are required" ||
    message === "workspace_id, client_id, and invoice_id are required" ||
    message.startsWith("Cannot create payment for ")
  ) {
    return {
      error: message,
      code: code ?? "P0001",
      details: rpcError.details ?? null,
      hint: rpcError.hint ?? null,
    };
  }

  return {
    error: message,
    code,
    details: rpcError.details ?? null,
    hint: rpcError.hint ?? null,
  };
}

/**
 * Expected business-rule failures from manual payment RPC/actions.
 * These must be surfaced to the user — not thrown through the route boundary.
 */
export function isExpectedPaymentManualRpcError(result: PaymentManualActionError): boolean {
  const { error, code } = result;

  if (code === "23505" || code === "22023" || code === "42501" || code === "P0001" || code === "P0002") {
    return true;
  }

  if (
    error === EXPECTED_UPDATE_OVERPAY_MESSAGE ||
    error.includes("would result in overpayment") ||
    error.includes("exceeds the invoice outstanding balance") ||
    error.includes("transaction reference already exists") ||
    error.includes("Payment not found") ||
    error.includes("Invoice not found") ||
    error.includes("Client not found") ||
    error.includes("Cannot change client for an existing payment") ||
    error.includes("Cannot change invoice for an existing payment") ||
    error.includes("Invalid payment: missing invoice_id") ||
    error.includes("Not authenticated") ||
    error.includes("Not a workspace member") ||
    error.includes("Amount must be positive") ||
    error.includes("payment_date is required") ||
    error.includes("workspace_id is required") ||
    error.includes("workspace_id and payment_id are required") ||
    error.includes("workspace_id, client_id, and invoice_id are required") ||
    error.includes("Cannot create payment for ") ||
    error.includes("Selected invoice does not belong to selected client") ||
    error.includes("no outstanding balance") ||
    error.includes("Trial expired") ||
    error.includes("read-only")
  ) {
    return true;
  }

  return false;
}

/**
 * Maps rpc_create_payment_manual errors to createPayment action responses.
 */
export function mapCreatePaymentRpcError(rpcError: RpcErrorLike): PaymentManualActionError {
  return mapPaymentManualRpcBase(rpcError, "create");
}

/**
 * Maps rpc_update_payment_manual errors to updatePayment action responses.
 */
export function mapUpdatePaymentRpcError(rpcError: RpcErrorLike): PaymentManualActionError {
  const mapped = mapPaymentManualRpcBase(rpcError, "update");
  if (mapped.error.startsWith("Failed to update payment")) {
    return { ...mapped, error: `Failed to update payment: ${rpcError.message ?? "Unknown error"}` };
  }
  return mapped;
}
