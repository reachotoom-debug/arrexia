const FULLY_PAID_TOLERANCE = 0.01;

export function isInvoiceFullyPaid(
  outstanding: number | null | undefined
): boolean {
  return Number(outstanding ?? 0) <= FULLY_PAID_TOLERANCE;
}

export function canShowRecordPaymentCta(params: {
  isArchived: boolean;
  baseStatus: string | null | undefined;
  outstanding: number | null | undefined;
  clientIsActive: boolean;
  clientArchived: boolean;
}): boolean {
  if (params.isArchived) return false;

  const base = (params.baseStatus ?? "").toLowerCase();
  if (base === "draft" || base === "void") return false;
  if (isInvoiceFullyPaid(params.outstanding)) return false;
  if (!params.clientIsActive || params.clientArchived) return false;

  return true;
}

export function deriveDisplayStatusFromFinancials(params: {
  baseStatus: string;
  outstanding: number;
  paid: number;
  isOverdue: boolean;
}): string {
  const base = params.baseStatus.toLowerCase();
  if (base === "void") return "void";
  if (base === "draft") return "draft";
  if (params.outstanding <= FULLY_PAID_TOLERANCE) return "paid";
  if (base === "sent" && params.outstanding > 0 && params.isOverdue) return "overdue";
  if (base === "sent" && params.paid > 0 && params.outstanding > 0) {
    return "partially_paid";
  }
  if (base === "sent") return "sent";
  return base;
}
