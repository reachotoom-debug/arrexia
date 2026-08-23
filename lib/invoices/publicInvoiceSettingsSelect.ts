import type { Database } from "@/types/supabase/index";

/**
 * Minimum settings columns required by buildInvoiceBranding() and
 * resolvePaymentInstructionLines() for the public invoice page.
 * Exported for regression tests — do not widen without review.
 */
export const PUBLIC_INVOICE_SETTINGS_COLUMNS = [
  "branding_business_legal_name",
  "business_name",
  "workspace_display_name",
  "business_email",
  "business_phone",
  "business_website",
  "business_country",
  "business_city",
  "branding_business_address",
  "branding_tax_id",
  "invoice_thank_you_note",
  "payment_bank_name",
  "payment_bank_account_name",
  "payment_bank_account_number",
  "payment_bank_swift",
  "payment_bank_iban",
  "payment_paypal_handle",
  "payment_stripe_descriptor",
  "payment_other_instructions",
  "workspace_logo_url",
  "logo_url",
  "default_currency",
] as const satisfies ReadonlyArray<
  keyof Database["public"]["Tables"]["settings"]["Row"]
>;

export type PublicInvoiceSettingsRow = Pick<
  Database["public"]["Tables"]["settings"]["Row"],
  (typeof PUBLIC_INVOICE_SETTINGS_COLUMNS)[number]
>;

export const PUBLIC_INVOICE_SETTINGS_SELECT =
  PUBLIC_INVOICE_SETTINGS_COLUMNS.join(", ");

export const PUBLIC_INVOICE_VIEW_COLUMNS = [
  "display_status",
  "paid",
  "outstanding",
  "is_overdue",
  "overdue_days",
  "currency",
] as const;

export const PUBLIC_INVOICE_VIEW_SELECT = PUBLIC_INVOICE_VIEW_COLUMNS.join(", ");

export const PUBLIC_INVOICE_ITEM_COLUMNS = [
  "name",
  "description",
  "quantity",
  "unit_price",
  "line_total",
] as const;

export const PUBLIC_INVOICE_ITEM_SELECT = PUBLIC_INVOICE_ITEM_COLUMNS.join(", ");

export const PUBLIC_INVOICE_CLIENT_COLUMNS = ["name", "company"] as const;

export const PUBLIC_INVOICE_CLIENT_SELECT = PUBLIC_INVOICE_CLIENT_COLUMNS.join(", ");
