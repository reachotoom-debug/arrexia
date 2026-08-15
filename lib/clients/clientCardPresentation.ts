import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";

export type ClientCardContactInput = {
  phone: string | null;
  whatsapp: string | null;
  paymentTerms: number | null;
  country: string | null;
};

/**
 * Compact labeled contact lines for Clients card view.
 * Omits lines when underlying values are empty; country is shown without a prefix.
 */
export function buildClientCardContactLines(input: ClientCardContactInput): string[] {
  const lines: string[] = [];

  const phone = input.phone?.trim();
  if (phone) {
    lines.push(`Phone: ${phone}`);
  }

  const whatsapp = input.whatsapp?.trim();
  if (whatsapp) {
    lines.push(`WhatsApp: ${whatsapp}`);
  }

  if (input.paymentTerms != null) {
    const paymentTermsLabel = getPaymentTermsLabel(input.paymentTerms);
    if (paymentTermsLabel && paymentTermsLabel !== "-") {
      lines.push(`Payment terms: ${paymentTermsLabel}`);
    }
  }

  const country = input.country?.trim();
  if (country) {
    lines.push(country);
  }

  return lines;
}
