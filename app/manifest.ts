import type { MetadataRoute } from "next";
import { SEO_ASSETS, SEO_SITE } from "@/lib/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SEO_SITE.name,
    short_name: SEO_SITE.name,
    description: SEO_SITE.defaultDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: SEO_SITE.themeColor,
    lang: "en",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: SEO_ASSETS.icon,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: SEO_ASSETS.appleTouchIcon,
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: SEO_ASSETS.icon,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
