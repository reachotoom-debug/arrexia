import * as React from "react";
import { cn } from "@/lib/utils";

export type EntityCardProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  /** Shown below meta; right-aligned (and visually at bottom of the card body). */
  amount?: React.ReactNode;
  /** Primary status badge — aligned to the top-right with actions. */
  status: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional checkbox or icon placed at the start of the row (e.g. bulk select). */
  leading?: React.ReactNode;
  /** Extra rows after amount (e.g. divider + overdue flag). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * Shared mobile-first entity row card: title stack on the left, status + icon actions top-right,
 * optional amount right-aligned toward the bottom.
 */
export function EntityCard({
  title,
  subtitle,
  meta,
  amount,
  status,
  actions,
  leading,
  children,
  className,
}: EntityCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4",
        className
      )}
    >
      <div className="flex items-start gap-2">
        {leading ? (
          <div className="shrink-0 pt-0.5">{leading}</div>
        ) : null}
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="min-w-0 truncate text-base font-semibold text-slate-900 [&_a]:inline-block [&_a]:max-w-full [&_a]:truncate">
                {title}
              </div>
              {subtitle != null && subtitle !== false ? (
                <div className="break-words text-sm text-muted-foreground">
                  {subtitle}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {status}
              {actions}
            </div>
          </div>
          {meta != null && meta !== false ? (
            <div className="text-sm text-muted-foreground">{meta}</div>
          ) : null}
          {amount != null && amount !== false ? (
            <div className="ml-auto w-full min-w-0 text-right">{amount}</div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
