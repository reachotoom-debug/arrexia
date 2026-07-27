import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { formatMoney } from "@/lib/utils/format-money";

export type CollectionWhatsAppMessageInput = {
  clientName: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
};

export function buildCollectionWhatsAppMessage(input: CollectionWhatsAppMessageInput): string {
  const clientName = input.clientName?.trim() || "there";
  const invoiceNumber = input.invoiceNumber?.trim() || "your invoice";
  const currency = input.currency?.trim() || "USD";
  const outstandingFormatted = formatMoney(input.outstanding, currency);
  const dueDate = input.dueDate ? formatDateOnlyField(input.dueDate) : "—";

  const lines = [
    `Hi ${clientName},`,
    "",
    `This is a payment reminder for invoice ${invoiceNumber}.`,
    `Outstanding: ${outstandingFormatted}`,
    `Due date: ${dueDate}`,
  ];

  if (input.daysOverdue > 0) {
    lines.push(`This invoice is ${input.daysOverdue} days overdue.`);
  }

  lines.push("", "Please let us know once payment has been arranged.", "", "Thank you.");

  return lines.join("\n");
}
