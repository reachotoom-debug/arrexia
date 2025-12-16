"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { deleteInvoice } from "@/app/[workspaceId]/invoices/actions";
import ActionMenu from "@/components/clients/action-menu";
import InvoiceSortableHeader from "./invoice-sortable-header";
import DeleteInvoiceModal from "./delete-invoice-modal";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusBadgeClasses,
} from "@/lib/invoices/status-ui";

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status?: string; // Legacy field name - prefer display_status
  display_status?: string; // Canonical status from invoices_view
  currency: string;
  amount?: number;
  total?: number; // For backward compatibility, can be derived from amount
  total_amount?: number; // Legacy support
  clients: { name: string } | null;
}

interface InvoicesTableProps {
  invoices: Invoice[];
  workspaceId: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  currentSort: string;
  currentDirection: "asc" | "desc";
}

export default function InvoicesTable({
  invoices,
  workspaceId,
  currentPage,
  totalPages,
  totalCount,
  currentSort,
  currentDirection,
}: InvoicesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);

  const handleSort = (sortKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const newDirection =
      currentSort === sortKey && currentDirection === "asc" ? "desc" : "asc";
    params.set("sort", sortKey);
    params.set("direction", newDirection);
    params.set("page", "1");
    router.push(`/${workspaceId}/invoices?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/${workspaceId}/invoices?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (deletingInvoice) {
      try {
        await deleteInvoice(workspaceId, deletingInvoice.id);
        setDeletingInvoice(null);
        router.refresh();
      } catch (error) {
        alert("Failed to delete invoice");
      }
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Import centralized status UI helpers
  // Note: Using display_status from invoices_view as single source of truth

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl p-12 text-center border border-slate-200 shadow-sm">
        <div className="max-w-md mx-auto">
          <div className="text-4xl mb-4">📄</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No invoices found
          </h3>
          <p className="text-sm text-slate-600 mb-6">
            Get started by creating your first invoice
          </p>
          <Link
            href={`/${workspaceId}/invoices/new`}
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Create Invoice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <InvoiceSortableHeader
                label="Invoice #"
                sortKey="invoice_number"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
                className={clsx("text-xs font-medium text-slate-500 uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}
              />
              <InvoiceSortableHeader
                label="Client"
                sortKey="client_name"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
              />
              <InvoiceSortableHeader
                label="Issue Date"
                sortKey="issue_date"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
              />
              <InvoiceSortableHeader
                label="Due Date"
                sortKey="due_date"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
              />
              <InvoiceSortableHeader
                label="Amount"
                sortKey="amount"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
              />
              <InvoiceSortableHeader
                label="Status"
                sortKey="status"
                currentSort={currentSort}
                currentDirection={currentDirection}
                onSort={handleSort}
              />
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                <td className={clsx("py-4 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                  <Link
                    href={`/${workspaceId}/invoices/${invoice.id}/edit`}
                    className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    {invoice.invoice_number}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {invoice.clients?.name || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {formatDate(invoice.issue_date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {formatDate(invoice.due_date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {formatCurrency(invoice.amount ?? 0, invoice.currency)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getInvoiceStatusBadgeClasses(
                      invoice.display_status ?? invoice.status
                    )}`}
                  >
                    {getInvoiceStatusLabel(invoice.display_status ?? invoice.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <ActionMenu
                    onView={() =>
                      router.push(`/${workspaceId}/invoices/${invoice.id}/edit`)
                    }
                    onEdit={() =>
                      router.push(`/${workspaceId}/invoices/${invoice.id}/edit`)
                    }
                    onDelete={() => setDeletingInvoice(invoice)}
                    align="right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {totalCount} {totalCount === 1 ? "invoice" : "invoices"} found
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {deletingInvoice && (
        <DeleteInvoiceModal
          isOpen={!!deletingInvoice}
          invoiceNumber={deletingInvoice.invoice_number}
          onConfirm={handleDelete}
          onCancel={() => setDeletingInvoice(null)}
        />
      )}
    </>
  );
}
