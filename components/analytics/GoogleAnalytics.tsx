"use client";

import { Suspense } from "react";
import { GoogleAnalytics as NextGoogleAnalytics } from "@next/third-parties/google";
import { AnalyticsPageView } from "@/components/analytics/AnalyticsPageView";
import { getGaMeasurementId, isAnalyticsEnabled } from "@/lib/analytics/google";

/**
 * Loads GA4 once globally via @next/third-parties (afterInteractive gtag.js).
 * Measurement ID comes from NEXT_PUBLIC_GA_MEASUREMENT_ID — never hardcoded.
 */
export function GoogleAnalytics() {
  if (!isAnalyticsEnabled()) {
    return null;
  }

  const gaId = getGaMeasurementId();
  if (!gaId) {
    return null;
  }

  return (
    <>
      <NextGoogleAnalytics gaId={gaId} />
      <Suspense fallback={null}>
        <AnalyticsPageView />
      </Suspense>
    </>
  );
}
