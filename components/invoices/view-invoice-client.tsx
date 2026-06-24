// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteInvoice } from "@/app/[workspaceId]/invoices/actions";
import ActionMenu from "@/components/clients/action-menu";
import DeleteInvoiceModal from "./delete-invoice-modal";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusBadgeClasses,
} from "@/lib/invoices/status-ui";

interface Client {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  payment_terms?: number | null;
}

interface InvoiceItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  po_number?: string | null;
  notes?: string | null;
  clients: Client | null;
}

interface ViewInvoiceClientProps {
  invoice: Invoice;
  items: InvoiceItem[];
  subtotal: number;
  workspaceId: string;
  invoiceId: string;
}

export default function ViewInvoiceClient({
  invoice,
  items,
  subtotal,
  workspaceId,
  invoiceId,
}: ViewInvoiceClientProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Import centralized status UI helpers
  // Note: Using display_status from invoices_view as single source of truth

  const handleDelete = async () => {
    try {
      await deleteInvoice(workspaceId, invoiceId);
      router.push(`/${workspaceId}/invoices`);
    } catch {
      alert("Failed to delete invoice");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-slate-900">
                {invoice.invoice_number}
              </h1>
              {invoice.clients?.company && (
                <p className="text-sm text-slate-600 mt-1">
                  {invoice.clients.company}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getInvoiceStatusBadgeClasses(
                  invoice.display_status ?? invoice.status
                )}`}
              >
                {getInvoiceStatusLabel(invoice.display_status ?? invoice.status)}
              </span>
              <ActionMenu
                onView={() => {}}
                onEdit={() => router.push(`/${workspaceId}/invoices/${invoice.id}/edit`)}
                onDelete={() => setIsDeleting(true)}
                align="right"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client Details Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
              Client Details
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                  Name
                </label>
                <p className="text-sm text-slate-900">{invoice.clients?.name || "-"}</p>
              </div>
              {invoice.clients?.company && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    Company
                  </label>
                  <p className="text-sm text-slate-900">{invoice.clients.company}</p>
                </div>
              )}
              {invoice.clients?.email && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    Email
                  </label>
                  <p className="text-sm text-slate-900">{invoice.clients.email}</p>
                </div>
              )}
              {invoice.clients?.whatsapp && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    WhatsApp
                  </label>
                  <p className="text-sm text-slate-900">{invoice.clients.whatsapp}</p>
                </div>
              )}
              {invoice.clients?.country && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    Country
                  </label>
                  <p className="text-sm text-slate-900">{invoice.clients.country}</p>
                </div>
              )}
              {invoice.clients?.payment_terms !== null &&
                invoice.clients?.payment_terms !== undefined && (
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                      Payment Terms
                    </label>
                    <p className="text-sm text-slate-900">
                      {getPaymentTermsLabel(invoice.clients.payment_terms)}
                    </p>
                  </div>
                )}
            </div>
          </div>

          {/* Invoice Details Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
              Invoice Details
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                  Issue Date
                </label>
                <p className="text-sm text-slate-900">{formatDate(invoice.issue_date)}</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                  Due Date
                </label>
                <p className="text-sm text-slate-900">{formatDate(invoice.due_date)}</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                  Currency
                </label>
                <p className="text-sm text-slate-900">{invoice.currency}</p>
              </div>
              {invoice.po_number && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 font-medium block mb-1">
                    PO Number
                  </label>
                  <p className="text-sm text-slate-900">{invoice.po_number}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Line Items
            </h3>
          </div>
          {items.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-600">No line items found</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Line Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-900">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-slate-500 mt-1">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right">
                      {formatCurrency(item.unit_price, invoice.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 text-right">
                      {formatCurrency(item.line_total, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals Section */}
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(subtotal, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total:</span>
                  <span>{formatCurrency(subtotal, invoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
              Internal Notes
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => {
              // PDF download placeholder
              alert("PDF download coming soon");
            }}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Download PDF
          </button>
          <Link
            href={`/${workspaceId}/invoices/${invoice.id}/edit`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {isDeleting && (
        <DeleteInvoiceModal
          isOpen={isDeleting}
          invoiceNumber={invoice.invoice_number}
          onConfirm={handleDelete}
          onCancel={() => setIsDeleting(false)}
        />
      )}
    </>
  );
}

