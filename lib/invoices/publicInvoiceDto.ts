/**
 * Explicit public invoice read model — no internal identifiers or admin metadata.
 */

export type PublicInvoiceLineItem = {
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PublicInvoicePaymentDetails = {
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwift: string | null;
  bankIban: string | null;
  paypalHandle: string | null;
  stripeDescriptor: string | null;
  otherInstructions: string | null;
};

export type PublicInvoiceCompany = {
  name: string;
  logoUrl: string | null;
  addressLines: string[];
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
};

export type PublicInvoiceClient = {
  name: string;
  company: string | null;
};

export type PublicInvoiceFinancials = {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
};

export type PublicInvoiceDto = {
  company: PublicInvoiceCompany;
  client: PublicInvoiceClient;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  paymentTermsLabel: string;
  currency: string;
  lineItems: PublicInvoiceLineItem[];
  financials: PublicInvoiceFinancials;
  displayStatus: string;
  overdueDays: number | null;
  notes: string | null;
  paymentInstructionLines: string[];
  paymentDetails: PublicInvoicePaymentDetails | null;
  thankYouNote: string;
  /** Reserved for future Pay Invoice CTA when a payment provider is connected. */
  payInvoiceAvailable: false;
};

/** Keys that must never appear on the public DTO. */
export const PUBLIC_INVOICE_FORBIDDEN_DTO_KEYS = [
  "workspaceId",
  "workspace_id",
  "id",
  "invoiceId",
  "invoice_id",
  "clientId",
  "client_id",
  "public_access_token",
  "publicAccessToken",
  "userId",
  "user_id",
  "auth",
  "riskLevel",
  "risk_level",
  "collectionPriority",
  "deliveryLogs",
  "delivery_log",
  "subscription",
  "organizationId",
  "organization_id",
  "billing_interval",
  "reminder",
  "collection",
] as const;

export function assertPublicInvoiceDtoShape(dto: PublicInvoiceDto): void {
  const serialized = JSON.stringify(dto);
  for (const key of PUBLIC_INVOICE_FORBIDDEN_DTO_KEYS) {
    if (serialized.includes(`"${key}"`)) {
      throw new Error(`Public invoice DTO leaked forbidden key: ${key}`);
    }
  }
}
