"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionMenu } from "./ActionMenu";
import { DeleteClientModal } from "./DeleteClientModal";
import { deleteClient } from "../actions";
import { formatMoney } from "@/lib/invoices/utils";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  payment_terms: number | null;
  status: string;
  invoicesCount?: number;
  outstanding?: number;
}

interface ClientsCardsProps {
  clients: Client[];
  workspaceId: string;
}

export function ClientsCards({ clients, workspaceId }: ClientsCardsProps) {
  const router = useRouter();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (clientToDelete) {
      await deleteClient(workspaceId, clientToDelete.id);
      setDeleteModalOpen(false);
      setClientToDelete(null);
      router.refresh();
    }
  };

  if (!clients.length) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        No clients found. Try adjusting your filters or search.
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {clients.map((client) => {
          const displayStatus = client.status === "archived" ? "inactive" : "active";
          const outstanding = Number(client.outstanding ?? 0);
          const invoicesCount = client.invoicesCount ?? 0;

          return (
            <div
              key={client.id}
              className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Header: name + status */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {client.name}
                  </div>
                  {client.company && (
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {client.company}
                    </div>
                  )}
                  {client.email && (
                    <div className="mt-1 text-xs text-slate-500 truncate">
                      {client.email}
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                    displayStatus === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {displayStatus === "active" ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Middle: key stats */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <div className="text-[11px] text-slate-500">Invoices</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {invoicesCount}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <div className="text-[11px] text-slate-500">Outstanding</div>
                  <div
                    className={`text-sm font-semibold ${
                      outstanding > 0
                        ? "text-red-600"
                        : outstanding < 0
                        ? "text-emerald-600"
                        : "text-slate-700"
                    }`}
                  >
                    {formatMoney(Math.abs(outstanding), "USD")}
                  </div>
                </div>
              </div>

              {/* Additional info */}
              {client.country && (
                <div className="mb-2 text-xs text-slate-500">
                  {client.country}
                </div>
              )}

              {/* Footer: actions */}
              <div className="mt-auto flex items-center justify-between pt-2 border-t border-slate-100">
                <Link
                  href={`/${workspaceId}/invoices?clientId=${client.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View invoices
                </Link>
                <ActionMenu
                  clientId={client.id}
                  workspaceId={workspaceId}
                  onDelete={() => handleDeleteClick(client)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {clientToDelete && (
        <DeleteClientModal
          isOpen={deleteModalOpen}
          clientName={clientToDelete.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteModalOpen(false);
            setClientToDelete(null);
          }}
        />
      )}
    </>
  );
}

