export const INVOICE_AMOUNT_MISMATCH_TOLERANCE = 0.01;

export type ImportedInvoiceStatusResult = {
  baseStatus: "draft" | "sent" | "void";
  warning: string | null;
  error: string | null;
};

const DERIVED_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  "partially paid": "Partially Paid",
  overdue: "Overdue",
};

function canonicalStatusLabel(status: "draft" | "sent" | "void"): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function resolveImportedInvoiceStatus(
  statusRaw: string | null | undefined
): ImportedInvoiceStatusResult {
  const statusLower = statusRaw ? statusRaw.toLowerCase().trim() : "";
  const validStatuses = ["draft", "sent", "void"];
  const derivedStatuses = ["paid", "partially paid", "overdue"];

  let baseStatus: "draft" | "sent" | "void" = "sent";

  if (!statusRaw) {
    return { baseStatus, warning: null, error: null };
  }

  if (validStatuses.includes(statusLower)) {
    return {
      baseStatus: statusLower as "draft" | "sent" | "void",
      warning: null,
      error: null,
    };
  }

  if (derivedStatuses.includes(statusLower)) {
    const label = DERIVED_STATUS_LABELS[statusLower] ?? statusRaw.trim();
    return {
      baseStatus: "sent",
      warning: `Status "${label}" was normalized to "${canonicalStatusLabel("sent")}". Payment status in Arrexia is determined from recorded payments.`,
      error: null,
    };
  }

  return {
    baseStatus,
    warning: null,
    error: `Invalid Status: ${statusRaw} (must be Draft, Sent, or Void)`,
  };
}

export function formatImportMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function buildInvoiceLineAmountMismatchWarning(params: {
  providedAmount: number;
  computedAmount: number;
  lineNumber: number;
  invoiceNumber: string;
  currency?: string;
  tolerance?: number;
}): string | null {
  const tolerance = params.tolerance ?? INVOICE_AMOUNT_MISMATCH_TOLERANCE;
  const difference = Math.abs(params.providedAmount - params.computedAmount);
  if (difference <= tolerance) {
    return null;
  }

  const currency = params.currency ?? "USD";
  const imported = formatImportMoney(params.providedAmount, currency);
  const calculated = formatImportMoney(params.computedAmount, currency);

  return (
    `Line ${params.lineNumber} (Invoice ${params.invoiceNumber}): Imported amount ${imported} differs from calculated amount ${calculated}. ` +
    `Arrexia will use the calculated amount ${calculated}.`
  );
}
