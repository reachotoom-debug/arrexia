"use client";

import { useEffect } from "react";
import { initClarity, isClarityEnabled } from "@/lib/analytics/clarity";

/**
 * Initializes Microsoft Clarity once after hydration.
 * Project ID comes from NEXT_PUBLIC_CLARITY_PROJECT_ID — never hardcoded.
 */
export function MicrosoftClarity() {
  useEffect(() => {
    if (!isClarityEnabled()) {
      return;
    }

    initClarity();
  }, []);

  return null;
}
