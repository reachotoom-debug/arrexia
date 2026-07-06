"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageview } from "@/lib/analytics/google";

/** Sends GA page_view on App Router navigations (initial load handled by gtag config). */
export function AnalyticsPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const query = searchParams.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    pageview(url);
  }, [pathname, searchParams]);

  return null;
}
