import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PAGE_MAX_DEFAULT,
  PAGE_MAX_NARROW,
  PAGE_MAX_TABLES,
  PAGE_MAX_WIDE_DETAIL,
  PAGE_WRAP_BASE,
} from "@/components/layout/pageLayout";

export type PageContainerVariant =
  | "default"
  | "narrow"
  | "wideDetail"
  | "tables"
  | "full";

const variantMax: Record<PageContainerVariant, string> = {
  default: PAGE_MAX_DEFAULT,
  narrow: PAGE_MAX_NARROW,
  wideDetail: PAGE_MAX_WIDE_DETAIL,
  tables: PAGE_MAX_TABLES,
  full: "",
};

interface PageContainerProps {
  children: ReactNode;
  variant?: PageContainerVariant;
  className?: string;
}

/**
 * Standard authenticated page width + horizontal padding.
 * Matches workspace shell inner layout; use variant="full" only when opting out of max-width.
 */
export function PageContainer({
  children,
  variant = "default",
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(PAGE_WRAP_BASE, variantMax[variant], className)}
    >
      {children}
    </div>
  );
}
