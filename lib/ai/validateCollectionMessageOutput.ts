import {
  ARREXIA_BRAND_FOOTER_LINE,
  ARREXIA_WEBSITE_URL,
  COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER,
  COLLECTION_MESSAGE_CTA,
} from "@/lib/collections/collectionMessageFormat";
import {
  isPublicInvoiceUrl,
  extractPublicInvoiceTokenFromUrl,
} from "@/lib/invoices/publicInvoiceUrl";

export const COLLECTION_MESSAGE_MAX_LENGTH = 1200;

const HTML_TAG_PATTERN = /<[^>]+>/;
const URL_PATTERN = /https?:\/\/[^\s]+|www\./gi;
const DANGEROUS_URL_SCHEME_PATTERN = /(?:javascript|data|vbscript):/i;

export type CollectionMessageValidationInput = {
  message: string;
  invoiceNumber: string;
  outstandingFormatted: string;
  dueDateFormatted: string;
  statusLine: string;
  /** When set, message may include this public invoice URL in addition to the Arrexia root URL. */
  allowedPublicInvoiceUrl?: string | null;
  /**
   * When validating AI prose before the app appends a trusted public invoice link, set false so
   * only the Arrexia root URL is required. Defaults to true when allowedPublicInvoiceUrl is set.
   */
  requirePublicInvoiceUrlInMessage?: boolean;
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

function normalizeDiscoveredUrls(text: string): string[] {
  const discoveredUrls = text.match(URL_PATTERN) ?? [];
  return discoveredUrls.map((url) =>
    url.toLowerCase().startsWith("www.") ? `https://${url}` : url
  );
}

function validateAllowedUrls(
  normalizedUrls: string[],
  allowedPublicInvoiceUrl?: string | null,
  requirePublicInvoiceUrlInMessage = false
): boolean {
  const allowedPublic = allowedPublicInvoiceUrl?.trim() ?? null;

  let arrexiaRootCount = 0;
  let publicInvoiceCount = 0;

  for (const url of normalizedUrls) {
    if (url === ARREXIA_WEBSITE_URL) {
      arrexiaRootCount += 1;
      continue;
    }
    if (allowedPublic && url === allowedPublic && isPublicInvoiceUrl(url)) {
      publicInvoiceCount += 1;
      continue;
    }
    if (isPublicInvoiceUrl(url)) {
      if (
        allowedPublic &&
        extractPublicInvoiceTokenFromUrl(url) ===
          extractPublicInvoiceTokenFromUrl(allowedPublic)
      ) {
        publicInvoiceCount += 1;
        continue;
      }
    }
    return false;
  }

  if (arrexiaRootCount !== 1) return false;

  if (allowedPublic && requirePublicInvoiceUrlInMessage) {
    if (publicInvoiceCount !== 1) return false;
    if (normalizedUrls.length !== 2) return false;
    return true;
  }

  if (allowedPublic && !requirePublicInvoiceUrlInMessage) {
    if (publicInvoiceCount !== 0) return false;
    if (normalizedUrls.length !== 1) return false;
    return true;
  }

  if (normalizedUrls.length !== 1) return false;
  return true;
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

  if (DANGEROUS_URL_SCHEME_PATTERN.test(trimmed)) {
    return { ok: false, reason: "url" };
  }

  const normalizedUrls = normalizeDiscoveredUrls(trimmed);
  const allowedPublic = input.allowedPublicInvoiceUrl?.trim() ?? null;
  const requirePublicInvoiceUrlInMessage =
    input.requirePublicInvoiceUrlInMessage ?? Boolean(allowedPublic);

  if (
    !validateAllowedUrls(
      normalizedUrls,
      input.allowedPublicInvoiceUrl,
      requirePublicInvoiceUrlInMessage
    )
  ) {
    return { ok: false, reason: "url" };
  }

  if (countExactMatches(trimmed, ARREXIA_BRAND_FOOTER_LINE) !== 1) {
    return { ok: false, reason: "footer" };
  }

  const rootUrlLineCount = trimmed
    .split("\n")
    .filter((line) => line.trim() === ARREXIA_WEBSITE_URL).length;
  if (rootUrlLineCount !== 1) {
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
