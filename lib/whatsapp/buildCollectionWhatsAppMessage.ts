import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { formatMoney } from "@/lib/utils/format-money";

export type CollectionWhatsAppMessageInput = {
  clientName: string | null;
  businessName: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
};

export function buildCollectionWhatsAppMessage(input: CollectionWhatsAppMessageInput): string {
  const clientName = input.clientName?.trim() || "there";
  const businessName = input.businessName?.trim() || "Your company";
  const invoiceNumber = input.invoiceNumber?.trim() || "your invoice";
  const currency = input.currency?.trim() || "USD";
  const outstandingFormatted = formatMoney(input.outstanding, currency);
  const dueDate = input.dueDate ? formatDateOnlyField(input.dueDate) : "—";

  const lines = [
    `Hi ${clientName},`,
    "",
    `This is a payment reminder from ${businessName} regarding invoice ${invoiceNumber}.`,
    `Outstanding: ${outstandingFormatted}`,
    `Due date: ${dueDate}`,
  ];

  if (input.daysOverdue > 0) {
    lines.push(`This invoice is ${input.daysOverdue} days overdue.`);
  }

  lines.push(
    "",
    "Please let us know once payment has been arranged.",
    "",
    "Thank you,",
    businessName,
    "Powered by Arrexia"
  );

  return lines.join("\n");
}
