import type { Metadata } from "next";
import { ARREXIA_BRAND } from "@/lib/brand/assets";
import { getConfiguredAppUrl } from "@/lib/config/appUrl";

type PublicPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
};

export function buildPublicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadataOptions): Metadata {
  const canonical = `${getConfiguredAppUrl()}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Arrexia",
      images: [{ url: ARREXIA_BRAND.ogImage, width: 1200, height: 630, alt: "Arrexia" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ARREXIA_BRAND.ogImage],
    },
  };
}
