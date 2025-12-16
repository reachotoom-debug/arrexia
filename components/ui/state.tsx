"use client";

import React from "react";
import { AlertTriangle, Inbox } from "lucide-react";

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

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
        <Inbox className="h-5 w-5 text-slate-400" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {message && (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{message}</p>
      )}
      {children}
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

