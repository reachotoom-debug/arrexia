"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { updateCollectionsNote } from "../actions";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { EmptyState } from "@/components/ui/state";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  whatsapp_phone: string | null;
}

interface EnrichedInvoice {
  id: string;
  invoice_number: string;
  risk: "high" | "medium" | "low" | "none";
  outstanding: number;
  due_date: string | null;
  status: string;
  notes: string | null;
  currency: string | null;
  daysOverdue: number | null;
  clients: Client | null;
}

interface CollectionsTableProps {
  invoices: EnrichedInvoice[];
  workspaceId: string;
}

/** Overdue-day heat: 0-7 neutral, 8-30 amber, 31-60 orange, 61-90 red, 90+ max. Returns badge classes for readability. */
function getOverdueDaysHeatClasses(days: number | null): string {
  if (days == null || days < 0) return "bg-slate-100 text-slate-700 border-slate-200";
  if (days <= 7) return "bg-slate-100 text-slate-700 border-slate-200";
  if (days <= 30) return "bg-amber-100 text-amber-900 border-amber-300";
  if (days <= 60) return "bg-orange-200 text-orange-900 border-orange-400";
  if (days <= 90) return "bg-rose-200 text-rose-900 border-rose-400";
  return "bg-red-300 text-red-900 border-red-500";
}

function getRiskBadge(risk: string) {
  if (risk === "high") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 border border-red-200">
        H
      </span>
    );
  } else if (risk === "medium") {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 border border-orange-200">
        M
      </span>
    );
  } else if (risk === "low") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700 border border-yellow-200">
        L
      </span>
    );
  }
  return null;
}


function CollectionsNotesModal({
  invoice,
  workspaceId,
  onClose,
}: {
  invoice: EnrichedInvoice | null;
  workspaceId: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    startTransition(async () => {
      try {
        await updateCollectionsNote({
          invoiceId: invoice.id,
          workspaceId,
          notes: notes || null,
        });
        onClose();
      } catch (error) {
        console.error("Failed to update note:", error);
      }
    });
  }

  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Collections Note - {invoice.invoice_number}
          </h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="Add collections notes about follow-up, client communication, etc."
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-slate-500">
              {notes.length}/2000 characters
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CollectionsTable({
  invoices,
  workspaceId,
}: CollectionsTableProps) {
  const [editingInvoice, setEditingInvoice] = useState<EnrichedInvoice | null>(
    null
  );

  if (invoices.length === 0) {
    return (
      <EmptyState
        title="Nothing in collections"
        message="No overdue invoices match this view."
        actionLabel="View invoices"
        actionHref={`/${workspaceId}/invoices`}
      />
    );
  }

  return (
    <>
      <DataTableShell disableInnerScroll>
      <HorizontalScrollArea
        className="relative w-full min-w-0"
        viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
      >
        <div className={TABLE_MIN_WIDTH_INNER}>
        <table className={TABLE_BASE}>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className={`hidden lg:table-cell ${TABLE_TH}`}>Risk</th>
              <th className={clsx(TABLE_TH, INVOICE_NUMBER_COL_CLASS)}>Invoice #</th>
              <th className={clsx(TABLE_CELL_TEXT_COL, TABLE_TH)}>Client</th>
              <th className={`hidden lg:table-cell ${TABLE_TH}`}>Due Date</th>
              <th className={TABLE_TH_RIGHT}>Outstanding</th>
              <th className={TABLE_TH}>Status</th>
              <th className={clsx("hidden md:table-cell", TABLE_CELL_TEXT_COL, TABLE_TH)}>
                Contact
              </th>
              <th className={`${TABLE_TH} whitespace-nowrap`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const currency = inv.currency || "USD";
              const client = inv.clients;

              return (
                <tr key={inv.id} className={TABLE_ROW}>
                  <td className={`hidden lg:table-cell ${TABLE_TD}`}>{getRiskBadge(inv.risk)}</td>
                  <td className={clsx(TABLE_TD, "text-sm text-slate-700 whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${inv.id}`}
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className={clsx(TABLE_CELL_TEXT_COL, TABLE_TD, "text-slate-800")}>
                    <div className="min-w-0">
                      <div className="font-medium break-words">{client?.name ?? "—"}</div>
                      {client?.email ? (
                        <div className="mt-0.5 hidden break-words text-sm text-slate-500 md:block">
                          {client.email}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD} text-slate-700`}>
                    <div>
                      {inv.due_date
                        ? new Date(inv.due_date).toLocaleDateString()
                        : "—"}
                      {inv.daysOverdue !== null && (
                        <span
                          className={clsx(
                            "mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                            getOverdueDaysHeatClasses(inv.daysOverdue)
                          )}
                        >
                          {inv.daysOverdue} day{inv.daysOverdue !== 1 ? "s" : ""} overdue
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm`}>
                    <span className="font-semibold text-red-700">
                      {formatMoney(Math.abs(inv.outstanding), currency)}
                    </span>
                  </td>
                  <td className={`${TABLE_TD} whitespace-nowrap`}>
                    <StatusBadge type="invoice" status={inv.status} />
                  </td>
                  <td className={clsx("hidden md:table-cell", TABLE_TD, "text-sm text-slate-700", TABLE_CELL_TEXT_COL)}>
                    {client?.whatsapp_phone || client?.whatsapp ? (
                      <div className="break-words text-slate-600">{client?.whatsapp_phone || client?.whatsapp}</div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${TABLE_TD} whitespace-nowrap`}>
                    <Link
                      href={`/${workspaceId}/invoices/${inv.id}`}
                        className="inline-flex items-center whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      View invoice
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </HorizontalScrollArea>
      </DataTableShell>

      {editingInvoice && (
        <CollectionsNotesModal
          invoice={editingInvoice}
          workspaceId={workspaceId}
          onClose={() => setEditingInvoice(null)}
        />
      )}
    </>
  );
}

