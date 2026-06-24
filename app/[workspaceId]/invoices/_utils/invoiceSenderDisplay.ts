import type { Database } from "@/types/supabase/index";
import { formatAddressLines } from "@/lib/invoices/invoiceDisplay";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];

export type InvoiceSenderDisplay = {
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  taxId: string | null;
  /** Street / mailing address lines — never mixed into location */
  addressLines: string[];
  /** City / country only — never street address */
  location: string | null;
};

function senderLocation(settings: SettingsRow): string | null {
  const city = settings.business_city?.trim() || "";
  const country = settings.business_country?.trim() || "";
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

/**
 * From-card sender: mirrors Settings/branding priority (same order as PDF `buildInvoiceBranding` name).
 * Does not expose street address or tax ID.
 */
export function getInvoiceSenderDisplay(
  settings: SettingsRow | null
): InvoiceSenderDisplay {
  if (!settings) {
    return {
      name: "Your company",
      email: null,
      phone: null,
      website: null,
      taxId: null,
      addressLines: [],
      location: null,
    };
  }

  const name =
    settings.branding_business_legal_name?.trim() ||
    settings.business_name?.trim() ||
    settings.workspace_display_name?.trim() ||
    "Your company";

  return {
    name,
    email: settings.business_email?.trim() || null,
    phone: settings.business_phone?.trim() || null,
    website: settings.business_website?.trim() || null,
    taxId: settings.branding_tax_id?.trim() || null,
    addressLines: formatAddressLines(settings.branding_business_address),
    location: senderLocation(settings),
  };
}
