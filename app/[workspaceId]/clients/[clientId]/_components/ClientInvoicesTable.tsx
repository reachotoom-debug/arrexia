"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatMoney } from "@/lib/invoices/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { EmptyState } from "@/components/ui/state";

interface Invoice {
  id: string;
  invoice_number: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  amount: number;
  total_paid: number;
  outstanding_amount: number; // Legacy field name - maps from invoices_view.outstanding
  payment_state: string | null;
  archived_at: string | null;
}

interface ClientInvoicesTableProps {
  clientId: string;
  workspaceId: string;
  initialInvoices: Invoice[];
  isArchived: boolean;
  isInactive: boolean;
}

export function ClientInvoicesTable({
  clientId,
  workspaceId,
  initialInvoices,
  isArchived,
  isInactive,
}: ClientInvoicesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showArchived = searchParams.get("showArchived") === "true";
  const [invoices, setInvoices] = React.useState<Invoice[]>(initialInvoices);
  const [isLoading, setIsLoading] = React.useState(false);

  // Update invoices when showArchived changes
  React.useEffect(() => {
    if (!showArchived) {
      // Use initial invoices (active-only) when showArchived is false
      setInvoices(initialInvoices);
      return;
    }

    // Fetch all invoices (including archived) when showArchived is true
    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const url = new URL(`/${workspaceId}/clients/${clientId}/invoices`, window.location.origin);
        url.searchParams.set("showArchived", "true");
        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          setInvoices(data.invoices || []);
        }
      } catch (error) {
        console.error("Failed to load invoices", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, [showArchived, clientId, workspaceId, initialInvoices]);

  const toggleShowArchived = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (showArchived) {
      params.delete("showArchived");
    } else {
      params.set("showArchived", "true");
    }
    router.push(`/${workspaceId}/clients/${clientId}?${params.toString()}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };


  const invoicesWithTotals = invoices.map((invoice) => ({
    ...invoice,
    total: Number(invoice.amount ?? 0),
    paid: Number(invoice.total_paid ?? 0),
    outstanding: Number(invoice.outstanding_amount ?? 0),
  }));

  if (invoicesWithTotals.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Invoices
          </h2>
          <button
            onClick={toggleShowArchived}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
        <EmptyState
          bare
          title={showArchived ? "No archived invoices" : "No invoices yet"}
          message={
            showArchived
              ? "This client has no archived invoices."
              : "Create your first invoice for this client."
          }
          actionLabel={
            showArchived
              ? "Hide archived"
              : isArchived || isInactive
                ? undefined
                : "New invoice"
          }
          actionHref={
            showArchived
              ? `/${workspaceId}/clients/${clientId}`
              : isArchived || isInactive
                ? undefined
                : `/${workspaceId}/invoices/new?clientId=${clientId}`
          }
        >
          {!showArchived && (isArchived || isInactive) ? (
            <span
              className="mt-4 inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium shadow-sm bg-slate-300 text-slate-500 cursor-not-allowed"
              aria-disabled={true}
            >
              New Invoice
            </span>
          ) : null}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Invoices
        </h2>
        <button
          onClick={toggleShowArchived}
          className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-slate-500">
          Loading invoices...
        </div>
      ) : (
        <HorizontalScrollArea className="w-full" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
          <div className={TABLE_MIN_WIDTH_INNER}>
          <table className={TABLE_BASE}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={`${TABLE_TH} whitespace-nowrap`}>Invoice #</th>
                <th className={`hidden md:table-cell ${TABLE_TH} whitespace-nowrap`}>Issue Date</th>
                <th className={`hidden md:table-cell ${TABLE_TH} whitespace-nowrap`}>Due Date</th>
                <th className={`${TABLE_TH_RIGHT} whitespace-nowrap`}>Total Amount</th>
                <th className={`hidden lg:table-cell ${TABLE_TH_RIGHT} whitespace-nowrap`}>Outstanding</th>
                <th className={`${TABLE_TH} whitespace-nowrap`}>Status</th>
                <th className={`${TABLE_TH_RIGHT} whitespace-nowrap`}>Open</th>
              </tr>
            </thead>
            <tbody>
              {invoicesWithTotals.map((invoice) => (
                <tr key={invoice.id} className={TABLE_ROW}>
                  <td className={`${TABLE_TD} font-medium text-slate-900 whitespace-nowrap`}>
                    <div className="flex items-center gap-2">
                      {invoice.invoice_number}
                      {invoice.archived_at && (
                        <span className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 border-slate-300">
                          Archived
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-700 whitespace-nowrap`}>
                    {formatDate(invoice.issue_date)}
                  </td>
                  <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-700 whitespace-nowrap`}>
                    {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm font-medium text-slate-900`}>
                    {formatMoney(invoice.amount ?? invoice.total ?? 0, invoice.currency || "USD")}
                  </td>
                  <td
                    className={`hidden lg:table-cell ${TABLE_TD_RIGHT} text-sm font-medium ${
                      invoice.outstanding > 0
                        ? "text-red-600"
                        : invoice.outstanding < 0
                        ? "text-emerald-600"
                        : "text-slate-700"
                    }`}
                  >
                    {formatMoney(
                      Math.abs(invoice.outstanding),
                      invoice.currency || "USD"
                    )}
                  </td>
                  <td className={`${TABLE_TD} whitespace-nowrap`}>
                    <StatusBadge type="invoice" status={invoice.payment_state ?? invoice.status ?? "sent"} />
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm`}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      aria-label="Open invoice"
                      title="Open invoice"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </HorizontalScrollArea>
      )}
    </div>
  );
}

