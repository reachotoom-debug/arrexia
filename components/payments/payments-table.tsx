"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { deletePayment } from "@/app/[workspaceId]/payments/actions";
import PaymentModal from "./payment-modal";
import { updatePayment } from "@/app/[workspaceId]/payments/actions";
import { type PaymentFormValues } from "@/lib/schemas/payment";
import { prettyLabel } from "@/lib/formatters/prettyLabel";
import { formatCurrency } from "@/lib/format/currency";

interface Payment {
  id: string;
  amount: number;
  created_at: string;
  method: string;
  status: string;
  transaction_id?: string | null;
  invoices: {
    invoice_number: string;
    clients: { name: string } | null;
  } | null;
}

interface PaymentsTableProps {
  payments: Payment[];
  workspaceId: string;
  search: string;
}

export default function PaymentsTable({
  payments,
  workspaceId,
  search,
}: PaymentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    startTransition(() => {
      router.push(`/${workspaceId}/payments?${params.toString()}`);
    });
  };

  const handleEdit = async (values: PaymentFormValues) => {
    if (editingPayment) {
      await updatePayment(workspaceId, editingPayment.id, values);
      setEditingPayment(null);
      router.refresh();
    }
  };

  const handleDelete = async (paymentId: string) => {
    if (confirm("Are you sure you want to delete this payment?")) {
      setIsDeleting(paymentId);
      try {
        await deletePayment(workspaceId, paymentId);
        router.refresh();
      } catch (error) {
        alert("Failed to delete payment");
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      refunded: "bg-gray-100 text-gray-800",
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  if (payments.length === 0) {
    return (
      <div className="rounded-xl bg-white p-12 text-center border border-slate-200">
        <p className="text-slate-600">No payments found</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search payments..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
        />
      </div>

      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Payment ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Invoice #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Method
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
            {payments.map((payment) => (
              <tr key={payment.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {payment.transaction_id || payment.id.slice(0, 8)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {payment.invoices?.invoice_number || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {payment.invoices?.clients?.name || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {formatCurrency(payment.amount, { currency: "USD" })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {formatDate(payment.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {prettyLabel(payment.method)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                      payment.status
                    )}`}
                  >
                    {payment.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingPayment(payment)}
                      className="text-slate-900 hover:text-slate-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(payment.id)}
                      disabled={isDeleting === payment.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingPayment && (
        <PaymentModal
          workspaceId={workspaceId}
          isOpen={!!editingPayment}
          onClose={() => setEditingPayment(null)}
          initialValues={{
            id: editingPayment.id,
            invoice_id: "", // Will need to fetch this
            amount: editingPayment.amount,
            date: editingPayment.created_at.split("T")[0],
            method: editingPayment.method as "cash" | "bank_transfer" | "check" | "credit_card" | "other",
            status: editingPayment.status as "pending" | "completed" | "failed" | "refunded",
            transaction_id: editingPayment.transaction_id || "",
          }}
          onSubmit={handleEdit}
        />
      )}
    </>
  );
}
