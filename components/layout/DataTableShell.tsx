import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card chrome for list tables: horizontal overflow stays inside this shell (not the page body).
 * Set `disableInnerScroll` when a child (e.g. HorizontalScrollArea) owns horizontal scrolling.
 */
export function DataTableShell({
  children,
  className,
  viewportClassName,
  disableInnerScroll = false,
}: {
  children: ReactNode;
  className?: string;
  /** Extra classes on the inner viewport wrapper */
  viewportClassName?: string;
  disableInnerScroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        className
      )}
    >
      <div
        className={cn(
          "min-w-0",
          !disableInnerScroll && "overflow-x-auto overflow-y-hidden",
          viewportClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
