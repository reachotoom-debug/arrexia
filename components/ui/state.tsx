"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { primaryCtaClass } from "@/components/ui/cta-styles";

interface ErrorStateProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load your data. Please try again.",
  retryLabel = "Retry",
  onRetry,
  children,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-5 w-5 text-red-500" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message && (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{message}</p>
      )}
      {children}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  /** Primary action as navigation (preferred over onAction when both set) */
  actionHref?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  /** Replaces default Inbox icon in the circle */
  icon?: React.ReactNode;
  /** Minimal container (e.g. inside a table cell or nested card) */
  bare?: boolean;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  actionHref,
  onAction,
  children,
  icon,
  bare = false,
}: EmptyStateProps) {
  const cta =
    actionLabel && actionHref ? (
      <Link href={actionHref} className={cn(primaryCtaClass, "mt-4")}>
        {actionLabel}
      </Link>
    ) : actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className={cn(primaryCtaClass, "mt-4")}
      >
        {actionLabel}
      </button>
    ) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        bare
          ? "py-10 px-4"
          : "rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
        {icon ?? <Inbox className="h-5 w-5 text-slate-400" />}
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message ? (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{message}</p>
      ) : null}
      {children}
      {cta}
    </div>
  );
}

