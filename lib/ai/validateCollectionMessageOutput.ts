export const COLLECTION_MESSAGE_MAX_LENGTH = 1200;

const HTML_TAG_PATTERN = /<[^>]+>/;
const URL_PATTERN = /https?:\/\/|www\./i;

export type CollectionMessageValidationInput = {
  message: string;
  invoiceNumber: string;
  outstandingFormatted: string;
};

export type CollectionMessageValidationResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

export function validateCollectionMessageOutput(
  input: CollectionMessageValidationInput
): CollectionMessageValidationResult {
  const trimmed = input.message.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  if (trimmed.length > COLLECTION_MESSAGE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  if (HTML_TAG_PATTERN.test(trimmed)) {
    return { ok: false, reason: "html" };
  }

  if (URL_PATTERN.test(trimmed)) {
    return { ok: false, reason: "url" };
  }

  if (!trimmed.includes(input.invoiceNumber)) {
    return { ok: false, reason: "missing_invoice_number" };
  }

  if (!trimmed.includes(input.outstandingFormatted)) {
    return { ok: false, reason: "missing_outstanding" };
  }

  return { ok: true, message: trimmed };
}
