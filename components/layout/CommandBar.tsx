import * as React from "react";
import { cn } from "@/lib/utils";

export function CommandBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex w-full flex-col gap-3", className)}
    >
      {children}
    </div>
  );
}

export function CommandBarTop({
  title,
  description,
  primaryAction,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Solid blue main CTA — full width on mobile, directly under title block */
  primaryAction?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        ) : (
          title
        )}
        {description ? (
          typeof description === "string" ? (
            <p className="mt-0 text-sm text-slate-500 md:mt-0.5">
              {description}
            </p>
          ) : (
            description
          )
        ) : null}
      </div>
      {primaryAction ? (
        <div className="w-full min-w-0 md:w-auto">{primaryAction}</div>
      ) : null}
    </div>
  );
}

export function CommandBarSearch({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 max-w-full md:max-w-md lg:max-w-[28rem]">
      {children}
    </div>
  );
}

export function CommandBarControls({
  filters,
  /** e.g. Reset filters — sits next to the Filters control, not right-aligned */
  filterAdjacentActions,
  secondaryActions,
}: {
  filters: React.ReactNode;
  filterAdjacentActions?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        {filters}
        {filterAdjacentActions}
      </div>
      {secondaryActions ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 md:gap-3">
          {secondaryActions}
        </div>
      ) : null}
    </div>
  );
}
