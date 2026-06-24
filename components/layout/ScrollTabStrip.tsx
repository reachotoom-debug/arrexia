import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Horizontally scrollable tab/chip row — no vertical scrollbar, no clipped tabs on narrow viewports. */
export function ScrollTabStrip({
  children,
  className,
  navClassName,
  "aria-label": ariaLabel = "Sections",
}: {
  children: ReactNode;
  className?: string;
  navClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto overflow-y-hidden border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <nav
        aria-label={ariaLabel}
        className={cn(
          "-mb-px flex min-w-max items-center gap-6 whitespace-nowrap px-0 md:gap-8",
          navClassName
        )}
      >
        {children}
      </nav>
    </div>
  );
}
