import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { formatCurrency } from "@/lib/format/currency";
import type { CollectionMessageFacts } from "./types";

type InvoiceFactSource = {
  client_name: string | null;
  invoice_number: string | null;
  outstanding: number | null;
  paid: number | null;
  total: number | null;
  currency: string | null;
  due_date: string | null;
  overdue_days: number | null;
  is_overdue: boolean | null;
  display_status: string | null;
};

export function buildCollectionMessageFacts(params: {
  invoice: InvoiceFactSource;
  businessName: string;
}): CollectionMessageFacts {
  const { invoice, businessName } = params;
  const currency = invoice.currency?.trim() || "USD";
  const outstanding = Number(invoice.outstanding ?? 0);
  const paid = Number(invoice.paid ?? 0);
  const daysOverdue = Math.max(0, Number(invoice.overdue_days ?? 0));
  const dueDate = invoice.due_date ?? null;
  const displayStatus = (invoice.display_status ?? "").toLowerCase();
  const partiallyPaid =
    displayStatus === "partially_paid" || (paid > 0 && outstanding > 0);

  const facts: CollectionMessageFacts = {
    clientName: invoice.client_name?.trim() || "there",
    businessName: businessName.trim() || "Your company",
    invoiceNumber: invoice.invoice_number?.trim() || "your invoice",
    outstanding,
    outstandingFormatted: formatCurrency(outstanding, { currency }),
    currency,
    dueDate,
    dueDateFormatted: dueDate ? formatDateOnlyField(dueDate) : "—",
    daysOverdue,
    isOverdue: Boolean(invoice.is_overdue),
    partiallyPaid,
  };

  if (paid > 0) {
    facts.amountPaidFormatted = formatCurrency(paid, { currency });
  }

  return facts;
}
