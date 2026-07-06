"use client";

import { useEffect } from "react";
import { trackBlogCategoryView } from "@/lib/analytics/google";

type BlogCategoryViewTrackerProps = {
  categorySlug: string;
};

export function BlogCategoryViewTracker({ categorySlug }: BlogCategoryViewTrackerProps) {
  useEffect(() => {
    trackBlogCategoryView({ category_slug: categorySlug });
  }, [categorySlug]);

  return null;
}
