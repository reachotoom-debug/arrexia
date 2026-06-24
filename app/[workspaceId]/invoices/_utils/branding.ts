/**
 * Helper to derive branding, payment details, and thank-you note from workspace settings.
 * Used by invoice detail view and PDF generation.
 */

import type { Database } from "@/types/supabase/index";
import { formatAddressLines } from "@/lib/invoices/invoiceDisplay";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];

export type InvoiceBranding = {
  fromName: string;
  fromEmail: string;
  fromPhone: string;
  fromWebsite: string;
  /** Structured location for PDF FROM line only (settings `business_country` / `business_city`). */
  fromCountry: string;
  fromCity: string;
  addressLines: string[];
  taxId: string;
  thankYou: string;
  paymentDetails: {
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    bankSwift: string;
    bankIban: string;
    paypalHandle: string;
    stripeDescriptor: string;
    otherInstructions: string;
  };
  hasAnyPaymentDetails: boolean;
  logoUrl: string | null;
  currencyCode: string;
};

export function buildInvoiceBranding(settings: SettingsRow | null): InvoiceBranding {
  const s = settings;

  const fromName =
    s?.branding_business_legal_name ||
    s?.business_name ||
    s?.workspace_display_name ||
    "Your company";

  const fromEmail = s?.business_email || "";
  const fromPhone = s?.business_phone || "";
  const fromWebsite = s?.business_website || "";

  const fromCountry = (s?.business_country || "").trim();
  const fromCity = (s?.business_city || "").trim();

  const addressLines = formatAddressLines(s?.branding_business_address);

  const taxId = s?.branding_tax_id || "";

  const thankYou =
    s?.invoice_thank_you_note?.trim() ||
    "Thank you for your business. Please complete payment by the due date using the payment details above.";

  const paymentDetails = {
    bankName: s?.payment_bank_name || "",
    bankAccountName: s?.payment_bank_account_name || "",
    bankAccountNumber: s?.payment_bank_account_number || "",
    bankSwift: s?.payment_bank_swift || "",
    bankIban: s?.payment_bank_iban || "",
    paypalHandle: s?.payment_paypal_handle || "",
    stripeDescriptor: s?.payment_stripe_descriptor || "",
    otherInstructions: s?.payment_other_instructions || "",
  };

  const hasAnyPaymentDetails = Object.values(paymentDetails).some(
    (v) => !!v && v.trim() !== ""
  );

  const logoUrl = s?.workspace_logo_url || s?.logo_url || null;
  const currencyCode = s?.default_currency || "USD";

  return {
    fromName,
    fromEmail,
    fromPhone,
    fromWebsite,
    fromCountry,
    fromCity,
    addressLines,
    taxId,
    thankYou,
    paymentDetails,
    hasAnyPaymentDetails,
    logoUrl,
    currencyCode,
  };
}
