export const COLLECTION_MESSAGE_TONES = [
  "friendly",
  "professional",
  "firm",
  "final_notice",
] as const;

export type CollectionMessageTone = (typeof COLLECTION_MESSAGE_TONES)[number];

export type CollectionMessageFacts = {
  clientName: string;
  businessName: string;
  invoiceNumber: string;
  outstanding: number;
  outstandingFormatted: string;
  currency: string;
  dueDate: string | null;
  dueDateFormatted: string;
  daysOverdue: number;
  isOverdue: boolean;
  partiallyPaid: boolean;
  amountPaidFormatted?: string;
};

export type GenerateCollectionMessageSuccess = {
  ok: true;
  message: string;
};

export type GenerateCollectionMessageFailure = {
  ok: false;
  code:
    | "validation"
    | "not_found"
    | "forbidden"
    | "ineligible"
    | "paid"
    | "config"
    | "provider"
    | "unsafe_output";
  userMessage: string;
};

export type GenerateCollectionMessageResult =
  | GenerateCollectionMessageSuccess
  | GenerateCollectionMessageFailure;
