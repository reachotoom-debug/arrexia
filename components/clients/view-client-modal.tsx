"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import ActionMenu from "./action-menu";

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  amount: number;
  total?: number; // For backward compatibility, can be derived from amount
}

interface Client {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  payment_terms?: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

interface ViewClientModalProps {
  isOpen: boolean;
  client: Client | null;
  invoices: Invoice[];
  workspaceId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ViewClientModal({
  isOpen,
  client,
  invoices,
  workspaceId,
  onClose,
  onEdit,
  onDelete,
}: ViewClientModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleClose();
        }
      };
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "unset";
      };
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!isOpen || !mounted || !client) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-slate-100 text-slate-800",
      sent: "bg-blue-100 text-blue-800",
      overdue: "bg-red-100 text-red-800",
      paid: "bg-green-100 text-green-800",
      void: "bg-gray-100 text-gray-500",
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl transition-all duration-200 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Card */}
        <div className="bg-white rounded-t-xl shadow-sm border-b border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-slate-900">
                {client.name}
              </h2>
              {client.company && (
                <p className="text-sm text-slate-600 mt-1">{client.company}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  client.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {client.status === "active" ? "Active" : "Archived"}
              </span>
              <ActionMenu
                onView={() => {}}
                onEdit={onEdit}
                onDelete={onDelete}
                align="right"
              />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Client Details Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
              Client Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                {client.email && (
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Email
                    </label>
                    <p className="text-sm text-slate-900">{client.email}</p>
                  </div>
                )}
                {client.whatsapp && (
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      WhatsApp
                    </label>
                    <p className="text-sm text-slate-900">{client.whatsapp}</p>
                  </div>
                )}
                {client.country && (
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Country
                    </label>
                    <p className="text-sm text-slate-900">{client.country}</p>
                  </div>
                )}
                {client.company && (
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Company
                    </label>
                    <p className="text-sm text-slate-900">{client.company}</p>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div className="pb-4 border-b border-slate-100">
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    Payment Terms
                  </label>
                  <p className="text-sm text-slate-900">
                    {getPaymentTermsLabel(client.payment_terms)}
                  </p>
                </div>
                {client.created_at && (
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Created At
                    </label>
                    <p className="text-sm text-slate-900">
                      {formatDate(client.created_at)}
                    </p>
                  </div>
                )}
                {client.updated_at && (
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Last Updated
                    </label>
                    <p className="text-sm text-slate-900">
                      {formatDate(client.updated_at)}
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    Status
                  </label>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      client.status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {client.status === "active" ? "Active" : "Archived"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Client Invoices Section */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
              Client Invoices
            </h3>
            {invoices.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-12 text-center border border-slate-200">
                <div className="max-w-sm mx-auto">
                  <div className="text-4xl mb-4">📄</div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    No invoices yet
                  </h4>
                  <p className="text-sm text-slate-600 mb-6">
                    Create your first invoice for this client
                  </p>
                  <Link
                    href={`/${workspaceId}/invoices/new?clientId=${client.id}`}
                    className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    New Invoice
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Invoice #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Issue Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {formatDate(invoice.issue_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {formatDate(invoice.due_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {formatCurrency(invoice.total ?? invoice.amount, invoice.currency)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                              invoice.status
                            )}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link
                            href={`/${workspaceId}/invoices/${invoice.id}/edit`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View Invoice
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
