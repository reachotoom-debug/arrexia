import { PLAN_DEFINITIONS, PUBLIC_PRICING } from "@/lib/billing/plans";
import { SEO_ASSETS, SEO_SITE, absoluteAssetUrl, absoluteUrl } from "@/lib/seo/site";

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SEO_SITE.name,
    url: SEO_SITE.url,
    logo: absoluteAssetUrl(SEO_ASSETS.logo),
    description: SEO_SITE.defaultDescription,
    email: SEO_SITE.contactEmail,
    founder: {
      "@type": "Person",
      name: SEO_SITE.founder.name,
      url: SEO_SITE.founder.url,
    },
    sameAs: [SEO_SITE.social.linkedIn, SEO_SITE.social.x],
  };
}

export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SEO_SITE.name,
    url: SEO_SITE.url,
    description: SEO_SITE.defaultDescription,
    publisher: {
      "@type": "Organization",
      name: SEO_SITE.name,
      logo: absoluteAssetUrl(SEO_ASSETS.logo),
    },
    inLanguage: "en-US",
  };
}

export function buildSoftwareApplicationSchema() {
  const starterPrice = PLAN_DEFINITIONS.starter.monthlyPrice;
  const proPrice = PLAN_DEFINITIONS.pro.monthlyPrice;

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SEO_SITE.applicationName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SEO_SITE.url,
    description: SEO_SITE.defaultDescription,
    offers: [
      {
        "@type": "Offer",
        name: "Starter Plan",
        price: starterPrice ?? 0,
        priceCurrency: "USD",
        url: absoluteUrl("/pricing"),
        description: `${PUBLIC_PRICING.trialLabel} available. Paid plans start on Starter.`,
      },
      {
        "@type": "Offer",
        name: "Pro Plan",
        price: proPrice ?? 0,
        priceCurrency: "USD",
        url: absoluteUrl("/pricing"),
      },
    ],
    featureList: [
      "Invoice tracking",
      "Payment reminder automation",
      "Overdue invoice management",
      "Cash flow visibility",
      "Accounts receivable dashboard",
    ],
    creator: {
      "@type": "Person",
      name: SEO_SITE.founder.name,
      url: SEO_SITE.founder.url,
    },
  };
}

export function buildBlogPostingSchema(input: {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  modifiedAt?: string;
  image?: string;
}) {
  const url = absoluteUrl(`/blog/${input.slug}`);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url,
    mainEntityOfPage: url,
    datePublished: input.publishedAt,
    dateModified: input.modifiedAt ?? input.publishedAt,
    image: input.image ? absoluteAssetUrl(input.image) : absoluteAssetUrl(SEO_ASSETS.ogImage),
    author: {
      "@type": "Person",
      name: SEO_SITE.founder.name,
      url: SEO_SITE.founder.url,
    },
    publisher: {
      "@type": "Organization",
      name: SEO_SITE.name,
      logo: {
        "@type": "ImageObject",
        url: absoluteAssetUrl(SEO_ASSETS.logo),
      },
    },
  };
}

export function buildHomeStructuredData() {
  return [buildOrganizationSchema(), buildWebsiteSchema(), buildSoftwareApplicationSchema()];
}

export function buildBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildWebApplicationSchema(input: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
    },
    provider: {
      "@type": "Organization",
      name: SEO_SITE.name,
      url: SEO_SITE.url,
    },
  };
}
