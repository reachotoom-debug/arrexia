import * as React from "react";

/**
 * List page title row: title + subtitle left; primary CTA and optional trailing actions (e.g. Export) right.
 * Desktop (≥1024): single row; mobile: stacks cleanly.
 */
export function PageHeader({
  title,
  description,
  primaryAction,
  headerTrailing,
  secondaryActions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  /** e.g. Export CSV — appears to the right of the primary CTA */
  headerTrailing?: React.ReactNode;
  /** Optional row below title on mobile; beside primary block from lg */
  secondaryActions?: React.ReactNode;
}) {
  const hasRight = Boolean(primaryAction || headerTrailing);
  const hasSecondary = Boolean(secondaryActions);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
        ) : (
          title
        )}
        {description ? (
          typeof description === "string" ? (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          ) : (
            description
          )
        ) : null}
        {hasSecondary ? (
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 lg:hidden">
            {secondaryActions}
          </div>
        ) : null}
      </div>
      {hasRight || hasSecondary ? (
        <div
          className={[
            "flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-end lg:gap-2",
            hasRight ? "w-full lg:w-auto" : "hidden w-full lg:flex lg:w-auto",
          ].join(" ")}
        >
          {hasSecondary ? (
            <div className="hidden min-w-0 flex-wrap items-center gap-2 lg:flex">
              {secondaryActions}
            </div>
          ) : null}
          {hasRight ? (
            <>
              {headerTrailing ? (
                <div className="order-2 flex w-full min-w-0 flex-wrap items-stretch gap-2 lg:order-1 lg:w-auto lg:shrink-0 lg:flex-nowrap lg:items-center">
                  {headerTrailing}
                </div>
              ) : null}
              {primaryAction ? (
                <div className="order-1 w-full min-w-0 lg:order-2 lg:w-auto lg:shrink-0 [&>*]:w-full lg:[&>*]:w-auto">
                  {primaryAction}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
