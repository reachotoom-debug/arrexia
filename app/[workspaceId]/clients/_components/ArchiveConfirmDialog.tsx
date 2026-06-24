"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface ArchiveConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  outstanding: number;
  workspaceId: string;
  clientId: string;
  action: "archive" | "inactivate";
}

export function ArchiveConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  outstanding,
  workspaceId,
  clientId,
  action,
}: ArchiveConfirmDialogProps) {
  if (!isOpen) return null;

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Icon and Title */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">
                {action === "archive" ? "Archive Client?" : "Inactivate Client?"}
              </h3>
            </div>
          </div>

          {/* Message */}
          <div className="mb-6">
            <p className="text-sm text-slate-700">
              This client has an outstanding balance of{" "}
              <span className="font-semibold">{formatMoney(outstanding)}</span>.
              {action === "archive"
                ? " Archiving hides them from active workflows but does not close invoices."
                : " Inactivating hides them from active workflows but does not close invoices."}
            </p>
            <p className="text-sm text-slate-600 mt-2">Continue?</p>
          </div>

          {/* Link to invoices */}
          <div className="mb-6">
            <Link
              href={`/${workspaceId}/invoices?clientId=${clientId}`}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              View client invoices →
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
