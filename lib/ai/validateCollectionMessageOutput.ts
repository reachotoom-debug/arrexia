import {
  ARREXIA_BRAND_FOOTER_LINE,
  ARREXIA_WEBSITE_URL,
  COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER,
  COLLECTION_MESSAGE_CTA,
} from "@/lib/collections/collectionMessageFormat";

export const COLLECTION_MESSAGE_MAX_LENGTH = 1200;

const HTML_TAG_PATTERN = /<[^>]+>/;
const URL_PATTERN = /https?:\/\/[^\s]+|www\./gi;

export type CollectionMessageValidationInput = {
  message: string;
  invoiceNumber: string;
  outstandingFormatted: string;
  dueDateFormatted: string;
  statusLine: string;
};

export type CollectionMessageValidationResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

function countExactMatches(text: string, needle: string): number {
  let count = 0;
  let start = 0;
  while (true) {
    const index = text.indexOf(needle, start);
    if (index === -1) break;
    count += 1;
    start = index + needle.length;
  }
  return count;
}

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

  const discoveredUrls = trimmed.match(URL_PATTERN) ?? [];
  const normalizedUrls = discoveredUrls.map((url) =>
    url.toLowerCase().startsWith("www.") ? `https://${url}` : url
  );

  if (
    normalizedUrls.length !== 1 ||
    normalizedUrls[0] !== ARREXIA_WEBSITE_URL
  ) {
    return { ok: false, reason: "url" };
  }

  if (countExactMatches(trimmed, ARREXIA_BRAND_FOOTER_LINE) !== 1) {
    return { ok: false, reason: "footer" };
  }

  if (countExactMatches(trimmed, ARREXIA_WEBSITE_URL) !== 1) {
    return { ok: false, reason: "duplicate_url" };
  }

  if (!trimmed.includes(input.invoiceNumber)) {
    return { ok: false, reason: "missing_invoice_number" };
  }

  if (!trimmed.includes(input.outstandingFormatted)) {
    return { ok: false, reason: "missing_outstanding" };
  }

  if (!trimmed.includes(`Due date: ${input.dueDateFormatted}`)) {
    return { ok: false, reason: "missing_due_date" };
  }

  if (!trimmed.includes(input.statusLine)) {
    return { ok: false, reason: "missing_status" };
  }

  if (!trimmed.includes(COLLECTION_MESSAGE_CTA)) {
    return { ok: false, reason: "missing_cta" };
  }

  if (!trimmed.includes(COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER)) {
    return { ok: false, reason: "missing_disclaimer" };
  }

  return { ok: true, message: trimmed };
}
