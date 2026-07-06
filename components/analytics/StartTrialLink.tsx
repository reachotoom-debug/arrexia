"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackStartFreeTrial } from "@/lib/analytics/google";

type StartTrialLinkProps = ComponentProps<typeof Link> & {
  source: string;
  plan?: "starter" | "pro";
};

/** Trial CTA link that fires `start_free_trial` without changing navigation behavior. */
export function StartTrialLink({ source, plan, onClick, ...props }: StartTrialLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackStartFreeTrial(source, plan);
        onClick?.(event);
      }}
    />
  );
}
