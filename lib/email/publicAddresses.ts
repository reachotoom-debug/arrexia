/** Client-safe public mailbox addresses and mailto routing helpers. */

export const PUBLIC_ARREXIA_EMAIL_ADDRESSES = {
  hello: "hello@arrexia.app",
  support: "support@arrexia.app",
  sales: "sales@arrexia.app",
} as const;

export type PublicArrexiaMailboxKey = keyof typeof PUBLIC_ARREXIA_EMAIL_ADDRESSES;

export function buildMailtoHref(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export function getGeneralContactMailtoHref(): string {
  return buildMailtoHref(
    PUBLIC_ARREXIA_EMAIL_ADDRESSES.hello,
    "General inquiry"
  );
}

export function getSupportContactMailtoHref(): string {
  return buildMailtoHref(
    PUBLIC_ARREXIA_EMAIL_ADDRESSES.support,
    "Support request"
  );
}

/** Contact Sales / Enterprise CTA destination. */
export function getEnterpriseContactHref(): string {
  return buildMailtoHref(
    PUBLIC_ARREXIA_EMAIL_ADDRESSES.sales,
    "Enterprise inquiry"
  );
}

export const PUBLIC_CONTACT_CHANNELS = [
  {
    title: "General inquiries and partnerships",
    description: "Product questions, partnerships, press, and feedback.",
    email: PUBLIC_ARREXIA_EMAIL_ADDRESSES.hello,
    subject: "General inquiry",
  },
  {
    title: "Technical support",
    description: "Help with your workspace, imports, reminders, invoices, or setup.",
    email: PUBLIC_ARREXIA_EMAIL_ADDRESSES.support,
    subject: "Support request",
  },
  {
    title: "Enterprise and sales",
    description: "Pricing, enterprise plans, demos, and sales conversations.",
    email: PUBLIC_ARREXIA_EMAIL_ADDRESSES.sales,
    subject: "Enterprise inquiry",
  },
] as const;
