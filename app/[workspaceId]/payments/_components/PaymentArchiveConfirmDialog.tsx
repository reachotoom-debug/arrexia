"use client";

import * as React from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";

interface Payment {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  amount: number;
  currency: string;
  payment_date: string;
}

interface PaymentArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  payments: Payment[];
  workspaceId: string;
  isArchive: boolean; // true for archive, false for unarchive
}

export function PaymentArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  payments,
  workspaceId,
  isArchive,
}: PaymentArchiveConfirmDialogProps) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  // Calculate total amount
  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const currency = payments[0]?.currency || "USD";

  // Show max 5 items, then "+N more"
  const displayItems = payments.slice(0, 5);
  const remainingCount = payments.length - 5;

  // Format date helper
  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid Date";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleCancel}>
      <div
        className="bg-white rounded-xl shadow-lg max-w-lg w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          {isArchive ? "Archive payments?" : "Unarchive payments?"}
        </h3>

        {/* Summary */}
        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
          <div className="text-sm text-slate-700">
            <div className="font-medium mb-1">
              {payments.length} payment{payments.length !== 1 ? "s" : ""} selected
            </div>
            <div className="text-slate-600">
              Total amount: <span className="font-medium text-slate-900">{formatCurrency(totalAmount, { currency })}</span>
            </div>
          </div>
        </div>

        {/* Warning message */}
        <p className="text-sm text-slate-600 mb-4">
          {isArchive
            ? "Archiving payments will reduce invoice paid totals and may change invoice status."
            : "Unarchiving payments will add them back to active views and update invoice totals."}
        </p>

        {/* Payment list */}
        <div className="mb-6 max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
          <div className="divide-y divide-slate-100">
            {displayItems.map((payment) => (
              <div key={payment.id} className="p-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {payment.client_name || "—"}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {payment.invoice_id && payment.invoice_number ? (
                        <Link
                          href={`/${workspaceId}/invoices/${payment.invoice_id}`}
                          className="text-blue-600 hover:text-blue-700 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {payment.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Unapplied</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatDate(payment.payment_date)}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-900 whitespace-nowrap">
                    {formatCurrency(payment.amount, { currency: payment.currency, fallbackCurrency: currency })}
                  </div>
                </div>
              </div>
            ))}
            {remainingCount > 0 && (
              <div className="p-3 text-sm text-slate-500 italic">
                +{remainingCount} more payment{remainingCount !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

