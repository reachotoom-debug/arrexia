import type { MetadataRoute } from "next";

export type SeoPageId =
  | "home"
  | "about"
  | "pricing"
  | "contact"
  | "privacy"
  | "terms"
  | "cookies"
  | "security"
  | "blog"
  | "tools"
  | "toolsDsoCalculator";

export type SeoPageConfig = {
  path: string;
  title: string;
  description: string;
  keywords?: readonly string[];
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
};

export const SEO_PAGES: Record<SeoPageId, SeoPageConfig> = {
  home: {
    path: "/",
    title: "Arrexia | Cash Collection Operations Platform",
    description:
      "Reduce overdue receivables, automate payment follow-up, track collections, and improve cash flow with Arrexia — a modern Cash Collection Operations Platform.",
    keywords: [
      "cash collection operations",
      "accounts receivable automation",
      "payment reminder software",
      "cash flow management",
    ],
    priority: 1,
    changeFrequency: "weekly",
  },
  about: {
    path: "/about",
    title: "About Arrexia | Cash Collection Operations Platform",
    description:
      "Learn how Arrexia helps businesses improve cash flow through accounts receivable automation, collections workflows, and payment follow-up.",
    priority: 0.8,
    changeFrequency: "monthly",
  },
  pricing: {
    path: "/pricing",
    title: "Arrexia Pricing | Cash Collection Operations Plans",
    description:
      "Compare Arrexia pricing for collections workflows, payment reminders, and accounts receivable operations. Start a 14-day free trial.",
    priority: 0.9,
    changeFrequency: "weekly",
  },
  contact: {
    path: "/contact",
    title: "Contact Arrexia | Support & Business Inquiries",
    description:
      "Contact Arrexia for product questions, partnerships, and technical support. We usually respond within 1–2 business days.",
    priority: 0.7,
    changeFrequency: "monthly",
  },
  privacy: {
    path: "/privacy",
    title: "Arrexia Privacy Policy | Data Protection & Privacy",
    description:
      "Read how Arrexia collects, uses, and protects your account, business, and technical data across invoice and collections workflows.",
    priority: 0.4,
    changeFrequency: "yearly",
  },
  terms: {
    path: "/terms",
    title: "Arrexia Terms of Service | Usage Terms",
    description:
      "Review the terms governing your use of Arrexia, including accounts, workspaces, subscriptions, and acceptable use.",
    priority: 0.4,
    changeFrequency: "yearly",
  },
  cookies: {
    path: "/cookies",
    title: "Arrexia Cookie Policy | Cookies & Sessions",
    description:
      "Understand how Arrexia uses cookies and similar technologies for authentication, sessions, and product preferences.",
    priority: 0.3,
    changeFrequency: "yearly",
  },
  security: {
    path: "/security",
    title: "Security at Arrexia | Data Protection & Access Control",
    description:
      "Learn how Arrexia protects your data with authentication, workspace access controls, encryption, and secure infrastructure.",
    priority: 0.6,
    changeFrequency: "monthly",
  },
  blog: {
    path: "/blog",
    title: "Arrexia Blog | Cash Flow & Collections Insights",
    description:
      "Practical guides on cash flow, collections, accounts receivable automation, and finance operations for growing businesses.",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  tools: {
    path: "/tools",
    title: "Free Cash Collection Tools | Arrexia",
    description:
      "Free cash collection calculators for DSO, invoice aging, payment terms, and late payment interest — built to help finance teams make better collection decisions.",
    priority: 0.75,
    changeFrequency: "monthly",
  },
  toolsDsoCalculator: {
    path: "/tools/dso-calculator",
    title: "DSO Calculator | Days Sales Outstanding Tool",
    description:
      "Calculate your Days Sales Outstanding (DSO) with net credit sales, average accounts receivable, and period length. Free DSO calculator from Arrexia.",
    keywords: ["DSO calculator", "days sales outstanding", "cash flow management"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
} as const;

export const PUBLIC_SITEMAP_PAGE_IDS: SeoPageId[] = [
  "home",
  "about",
  "pricing",
  "contact",
  "privacy",
  "terms",
  "cookies",
  "security",
  "blog",
  "tools",
  "toolsDsoCalculator",
];
