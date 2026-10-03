"use client";

import { useEffect } from "react";
import { initializePaddleClient } from "@/lib/billing/paddle/initializePaddleClient";

export function LandingPaddleInitializer() {
  useEffect(() => {
    void initializePaddleClient();
  }, []);

  return null;
}
