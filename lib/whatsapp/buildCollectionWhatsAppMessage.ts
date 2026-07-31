import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import {
  buildCollectionMessageFooterLines,
  COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER,
  COLLECTION_MESSAGE_CTA,
  formatCollectionMessageStatusLine,
} from "@/lib/collections/collectionMessageFormat";
import { formatMoney } from "@/lib/utils/format-money";

export type CollectionWhatsAppMessageInput = {
  clientName: string | null;
  businessName: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
  /** Workspace calendar date (YYYY-MM-DD) from server-side evaluation. Required when daysOverdue is 0. */
  evaluationDate?: string;
};

export function buildCollectionWhatsAppMessage(input: CollectionWhatsAppMessageInput): string {
  const clientName = input.clientName?.trim() || "there";
  const businessName = input.businessName?.trim() || "Your company";
  const invoiceNumber = input.invoiceNumber?.trim() || "your invoice";
  const currency = input.currency?.trim() || "USD";
  const outstandingFormatted = formatMoney(input.outstanding, currency);
  const dueDate = input.dueDate ? formatDateOnlyField(input.dueDate) : "—";
  const statusLine = formatCollectionMessageStatusLine({
    daysOverdue: input.daysOverdue,
    dueDate: input.dueDate,
    evaluationDate: input.evaluationDate,
  });

  const lines = [
    `Hello ${clientName},`,
    "",
    `This is a payment reminder from ${businessName} regarding invoice ${invoiceNumber}.`,
    `Outstanding: ${outstandingFormatted}`,
    `Due date: ${dueDate}`,
    statusLine,
    "",
    COLLECTION_MESSAGE_CTA,
    COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER,
    "",
    ...buildCollectionMessageFooterLines(businessName),
  ];

  return lines.join("\n");
}
