"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { updateCollectionsNote } from "../actions";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
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

function sanitizePhone(num: string): string {
  return num.replace(/[^0-9+]/g, "");
}

type PrimaryContact =
  | { type: "whatsapp" | "phone" | "email"; label: string; link: string }
  | { type: "none"; label: string; link?: undefined };

function getPrimaryContact(client: Client | null): PrimaryContact {
  if (!client) {
    return { type: "none", label: "—" };
  }

  if (client.whatsapp && client.whatsapp.trim() !== "") {
    const raw = client.whatsapp.trim();
    const sanitized = sanitizePhone(raw);
    return {
      type: "whatsapp",
      label: raw,
      link: `https://wa.me/${sanitized}`,
    };
  }

  if (client.whatsapp_phone && client.whatsapp_phone.trim() !== "") {
    const raw = client.whatsapp_phone.trim();
    const sanitized = sanitizePhone(raw);
    return {
      type: "phone",
      label: raw,
      link: `tel:${sanitized}`,
    };
  }

  if (client.email && client.email.trim() !== "") {
    const raw = client.email.trim();
    return {
      type: "email",
      label: raw,
      link: `mailto:${raw}?subject=Regarding your invoice`,
    };
  }

  return { type: "none", label: "—" };
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

function getStatusBadge(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower === "paid") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (statusLower === "overdue") {
    return "bg-red-50 text-red-700 border-red-200";
  } else if (statusLower === "sent") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  } else if (statusLower === "partial" || statusLower === "partially_paid") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  } else if (statusLower === "void") {
    return "bg-slate-100 text-slate-500 border-slate-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
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
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">
          No invoices found for collections. All invoices are up to date.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full table-auto text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Risk</th>
              <th className={clsx("py-2", INVOICE_NUMBER_COL_CLASS)}>Invoice #</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Due Date</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-center">Contact</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const currency = inv.currency || "USD";
              const client = inv.clients;
              const contact = getPrimaryContact(client);

              return (
                <tr
                  key={inv.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2">{getRiskBadge(inv.risk)}</td>
                  <td className={clsx("py-2 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${inv.id}`}
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <div>
                      <div className="font-medium">{client?.name ?? "—"}</div>
                      {client?.company && (
                        <div className="text-xs text-slate-500">
                          {client.company}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div>
                      {inv.due_date
                        ? new Date(inv.due_date).toLocaleDateString()
                        : "—"}
                      {inv.daysOverdue !== null && (
                        <div className="text-xs text-red-600 font-medium">
                          {inv.daysOverdue} day{inv.daysOverdue !== 1 ? "s" : ""}{" "}
                          overdue
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-red-600">
                    {formatMoney(Math.abs(inv.outstanding), currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                        inv.status
                      )}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-700">
                    {contact.type === "none" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <a
                        href={contact.link}
                        target={contact.type === "email" ? undefined : "_blank"}
                        rel={contact.type === "email" ? undefined : "noreferrer"}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        {contact.type === "whatsapp" && <span>🟢</span>}
                        {contact.type === "phone" && <span>📞</span>}
                        {contact.type === "email" && <span>✉️</span>}
                        <span>{contact.label}</span>
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditingInvoice(inv)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {inv.notes ? "Edit note" : "Add note"}
                    </button>
                    {inv.notes && (
                      <div className="mt-1 text-xs text-slate-600 line-clamp-1">
                        {inv.notes}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

