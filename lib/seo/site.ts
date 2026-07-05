import { ARREXIA_BRAND } from "@/lib/brand/assets";

/** Production canonical origin for SEO metadata, sitemap, and robots. */
export const SEO_SITE_URL = "https://arrexia.app";

export const SEO_SITE = {
  name: "Arrexia",
  tagline: "Cash Flow. Clarity. Confidence.",
  url: SEO_SITE_URL,
  applicationName: "Arrexia",
  category: "BusinessApplication",
  defaultTitle: "Arrexia | Accounts Receivable & Invoice Collection Software",
  defaultDescription:
    "Arrexia helps businesses track invoices, automate payment reminders, manage overdue balances, and improve cash flow with modern accounts receivable software.",
  locale: "en_US",
  themeColor: "#2563eb",
  founder: {
    name: "Mohammed Otoom",
    url: "https://www.linkedin.com/in/mohammed-otoom-84501561",
  },
  social: {
    linkedIn: "https://www.linkedin.com/in/mohammed-otoom-84501561",
    x: "https://x.com/Otoomai",
    xHandle: "@Otoomai",
  },
  contactEmail: "hello@arrexia.app",
  supportEmail: "support@arrexia.app",
  keywords: [
    "Accounts Receivable Software",
    "Invoice Management Software",
    "Invoice Tracking",
    "Payment Reminder Software",
    "Cash Flow Management",
    "Accounts Receivable Automation",
    "Invoice Collection Software",
    "Overdue Invoice Management",
    "Invoice Reminder",
    "Cash Collection",
    "Arrexia",
  ],
} as const;

export const SEO_ASSETS = {
  ogImage: ARREXIA_BRAND.ogImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: "Arrexia — Accounts receivable and invoice collection software",
  logo: ARREXIA_BRAND.logoLight,
  icon: ARREXIA_BRAND.icon,
  favicon: ARREXIA_BRAND.favicon,
  appleTouchIcon: ARREXIA_BRAND.appleTouchIcon,
} as const;

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SEO_SITE.url}${normalizedPath}`;
}

export function absoluteAssetUrl(assetPath: string): string {
  return absoluteUrl(assetPath);
}
