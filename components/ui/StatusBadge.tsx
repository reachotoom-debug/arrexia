"use client";

import * as React from "react";

const BASE_CLASSES =
  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "overdue"
  | "partially_paid"
  | "partial"
  | "paid"
  | "void"
  | "archived";
type PaymentStatus = "completed" | "pending" | "failed" | "refunded" | "archived";
type ClientStatus = "active" | "inactive" | "archived";
type ReminderDeliveryStatus = "sent" | "failed" | "queued" | "skipped";

const INVOICE_MAP: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent", className: "bg-blue-50 text-blue-700 border-blue-200" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
  partially_paid: { label: "Partially paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  partial: { label: "Partially paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  void: { label: "Void", className: "bg-slate-100 text-slate-500 border-slate-200" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PAYMENT_MAP: Record<
  string,
  { label: string; className: string }
> = {
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
  refunded: { label: "Refunded", className: "bg-slate-50 text-slate-700 border-slate-200" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const CLIENT_MAP: Record<
  string,
  { label: string; className: string }
> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  inactive: { label: "Inactive", className: "bg-slate-50 text-slate-700 border-slate-200" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const REMINDER_DELIVERY_MAP: Record<
  string,
  { label: string; className: string }
> = {
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
  queued: { label: "Queued", className: "bg-amber-50 text-amber-700 border-amber-200" },
  skipped: { label: "Skipped", className: "bg-slate-50 text-slate-700 border-slate-200" },
};

function getConfig(
  type: "invoice" | "payment" | "client" | "reminder_delivery",
  status: string
): { label: string; className: string } {
  const s = (status || "").toLowerCase().trim();
  const map =
    type === "invoice"
      ? INVOICE_MAP
      : type === "payment"
      ? PAYMENT_MAP
      : type === "client"
      ? CLIENT_MAP
      : REMINDER_DELIVERY_MAP;
  const config = map[s];
  if (config) return config;
  // Fallbacks
  if (type === "invoice") return { label: s.replace(/_/g, " ") || "—", className: "bg-slate-50 text-slate-700 border-slate-200" };
  if (type === "payment") return { label: s || "—", className: "bg-slate-50 text-slate-700 border-slate-200" };
  if (type === "client") return { label: s || "—", className: "bg-slate-50 text-slate-700 border-slate-200" };
  return { label: s || "—", className: "bg-slate-50 text-slate-700 border-slate-200" };
}

export type StatusBadgeType = "invoice" | "payment" | "client" | "reminder_delivery";

export interface StatusBadgeProps {
  type: StatusBadgeType;
  status: string;
  /** Override displayed label; classes still from type+status */
  label?: string;
  className?: string;
}

export function StatusBadge({ type, status, label: labelOverride, className = "" }: StatusBadgeProps) {
  const { label, className: variantClass } = getConfig(type, status);
  const displayLabel = labelOverride ?? label;
  return (
    <span
      className={`${BASE_CLASSES} ${variantClass} ${className}`}
    >
      {displayLabel}
    </span>
  );
}

/** Optional: get only the Tailwind classes for custom markup (e.g. existing span with different structure). */
export function getStatusBadgeClasses(
  type: StatusBadgeType,
  status: string
): string {
  const { className } = getConfig(type, status);
  return `${BASE_CLASSES} ${className}`;
}

/** Optional: get label only. */
export function getStatusBadgeLabel(type: StatusBadgeType, status: string): string {
  return getConfig(type, status).label;
}
