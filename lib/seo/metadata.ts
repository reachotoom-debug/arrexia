import type { Metadata, Viewport } from "next";
import { SEO_ASSETS, SEO_SITE, absoluteAssetUrl, absoluteUrl } from "@/lib/seo/site";
import { SEO_PAGES, type SeoPageId } from "@/lib/seo/pages";

function buildOpenGraphImage(image?: {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const source = image ?? {
    url: SEO_ASSETS.ogImage,
    alt: SEO_ASSETS.ogImageAlt,
    width: SEO_ASSETS.ogImageWidth,
    height: SEO_ASSETS.ogImageHeight,
  };

  return [
    {
      url: source.url.startsWith("http") ? source.url : absoluteAssetUrl(source.url),
      width: source.width ?? SEO_ASSETS.ogImageWidth,
      height: source.height ?? SEO_ASSETS.ogImageHeight,
      alt: source.alt,
      type: "image/png" as const,
    },
  ];
}

function buildSharedSocialMetadata(
  title: string,
  description: string,
  url: string,
  image?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
  },
) {
  const images = buildOpenGraphImage(image);
  const imageUrl = images[0]?.url ?? absoluteAssetUrl(SEO_ASSETS.ogImage);

  return {
    openGraph: {
      type: "website" as const,
      locale: SEO_SITE.locale,
      url,
      siteName: SEO_SITE.name,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image" as const,
      site: SEO_SITE.social.xHandle,
      creator: SEO_SITE.social.xHandle,
      title,
      description,
      images: [imageUrl],
    },
  };
}

/** Root layout metadata defaults and title template. */
export function buildRootMetadata(): Metadata {
  const canonical = absoluteUrl("/");

  return {
    metadataBase: new URL(SEO_SITE.url),
    title: {
      default: SEO_SITE.defaultTitle,
      template: `%s | ${SEO_SITE.name}`,
    },
    description: SEO_SITE.defaultDescription,
    applicationName: SEO_SITE.applicationName,
    category: SEO_SITE.category,
    authors: [{ name: SEO_SITE.founder.name, url: SEO_SITE.founder.url }],
    creator: SEO_SITE.founder.name,
    publisher: SEO_SITE.name,
    keywords: [...SEO_SITE.keywords],
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: [
        { url: SEO_ASSETS.favicon, sizes: "any" },
        { url: SEO_ASSETS.icon, type: "image/png", sizes: "512x512" },
      ],
      shortcut: SEO_ASSETS.favicon,
      apple: SEO_ASSETS.appleTouchIcon,
    },
    manifest: "/manifest.webmanifest",
    ...buildSharedSocialMetadata(SEO_SITE.defaultTitle, SEO_SITE.defaultDescription, canonical),
  };
}

export function buildRootViewport(): Viewport {
  return {
    themeColor: SEO_SITE.themeColor,
    width: "device-width",
    initialScale: 1,
    colorScheme: "light",
  };
}

/** Unique metadata for each public marketing page. */
export function buildPageMetadata(pageId: SeoPageId): Metadata {
  const page = SEO_PAGES[pageId];
  const canonical = absoluteUrl(page.path);
  const keywords = page.keywords ? [...SEO_SITE.keywords, ...page.keywords] : [...SEO_SITE.keywords];

  return {
    title: {
      absolute: page.title,
    },
    description: page.description,
    keywords,
    alternates: {
      canonical,
    },
    ...buildSharedSocialMetadata(page.title, page.description, canonical),
  };
}

/** Backward-compatible helper for legacy imports. */
export function buildPublicPageMetadata(options: {
  title: string;
  description: string;
  path: string;
  image?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
  };
}): Metadata {
  const canonical = absoluteUrl(options.path);

  return {
    title: {
      absolute: options.title,
    },
    description: options.description,
    alternates: {
      canonical,
    },
    ...buildSharedSocialMetadata(options.title, options.description, canonical, options.image),
  };
}
