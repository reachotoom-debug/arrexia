import { ARREXIA_BRAND } from "@/lib/brand/assets";
import { PUBLIC_ARREXIA_EMAIL_ADDRESSES } from "@/lib/email/publicAddresses";

/** Production canonical origin for SEO metadata, sitemap, and robots. */
export const SEO_SITE_URL = "https://arrexia.app";

export const SEO_SITE = {
  name: "Arrexia",
  tagline: "Cash Flow. Clarity. Confidence.",
  url: SEO_SITE_URL,
  applicationName: "Arrexia",
  category: "BusinessApplication",
  defaultTitle: "Arrexia | AI-Powered Accounts Receivable & Collections Platform",
  defaultDescription:
    "Recover more cash with less manual effort. Arrexia helps teams prioritize overdue receivables, automate payment follow-up, and act on collections with AI-assisted communication.",
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
  contactEmail: PUBLIC_ARREXIA_EMAIL_ADDRESSES.hello,
  supportEmail: PUBLIC_ARREXIA_EMAIL_ADDRESSES.support,
  keywords: [
    "Accounts Receivable Software",
    "Accounts Receivable Automation",
    "Collections Software",
    "Invoice Collection Software",
    "Overdue Invoice Management",
    "AI Accounts Receivable",
    "AI Collections",
    "Payment Collection Automation",
    "Receivables Tracking",
    "Arrexia",
  ],
} as const;

export const SEO_ASSETS = {
  ogImage: ARREXIA_BRAND.ogImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: "Arrexia — AI-Powered Accounts Receivable & Collections Platform",
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
