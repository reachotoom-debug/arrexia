import {
  isNonCollectibleBaseStatus,
  normalizeBaseStatus,
} from "@/lib/reminders/eligibility";

const FULLY_PAID_TOLERANCE = 0.01;

export function isOperationalReceivableClient(params: {
  isActive: boolean | null | undefined;
  archivedAt: string | null | undefined;
}): boolean {
  if (params.archivedAt) return false;
  return params.isActive === true;
}

export function isOperationalReceivableInvoice(params: {
  archivedAt?: string | null;
  baseStatus?: string | null;
  outstanding?: number | null;
  clientIsActive?: boolean | null;
  clientArchivedAt?: string | null;
}): boolean {
  if (params.archivedAt) return false;
  if (!(Number(params.outstanding ?? 0) > FULLY_PAID_TOLERANCE)) return false;
  if (
    !isOperationalReceivableClient({
      isActive: params.clientIsActive,
      archivedAt: params.clientArchivedAt,
    })
  ) {
    return false;
  }
  const base = normalizeBaseStatus(params.baseStatus ?? null);
  if (isNonCollectibleBaseStatus(base)) return false;
  return true;
}

export function countsTowardClientCollectibleOutstanding(params: {
  displayStatus?: string | null;
  baseStatus?: string | null;
}): boolean {
  const display = (params.displayStatus ?? "").toLowerCase();
  const base = (params.baseStatus ?? "").toLowerCase();
  if (display === "void" || display === "draft") return false;
  if (base === "void" || base === "draft") return false;
  return true;
}

export type PaymentCreationBlockReason =
  | "archived_client"
  | "inactive_client"
  | "archived_invoice"
  | "void_invoice"
  | "draft_invoice"
  | "fully_paid";

export function getPaymentCreationBlockReason(params: {
  clientArchived: boolean;
  clientIsActive: boolean | null | undefined;
  invoiceArchived: boolean;
  baseStatus: string | null | undefined;
  outstanding: number | null | undefined;
}): PaymentCreationBlockReason | null {
  if (params.clientArchived) return "archived_client";
  if (params.clientIsActive !== true) return "inactive_client";
  if (params.invoiceArchived) return "archived_invoice";

  const base = normalizeBaseStatus(params.baseStatus ?? null);
  if (base === "void") return "void_invoice";
  if (base === "draft") return "draft_invoice";
  if (!(Number(params.outstanding ?? 0) > FULLY_PAID_TOLERANCE)) return "fully_paid";

  return null;
}

export function paymentCreationBlockMessage(
  reason: PaymentCreationBlockReason
): string {
  switch (reason) {
    case "archived_client":
      return "Cannot create payment for archived client";
    case "inactive_client":
      return "Cannot create payment for inactive client";
    case "archived_invoice":
      return "Cannot create payment for archived invoice";
    case "void_invoice":
      return "Cannot create payment for void invoice";
    case "draft_invoice":
      return "Cannot create payment for draft invoice. Invoice must be sent first.";
    case "fully_paid":
      return "Cannot create payment for fully paid invoice";
  }
}
