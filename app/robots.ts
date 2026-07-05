import type { MetadataRoute } from "next";
import { SEO_SITE } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/login",
        "/register",
        "/auth/",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SEO_SITE.url}/sitemap.xml`,
    host: SEO_SITE.url,
  };
}
