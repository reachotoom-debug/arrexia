"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionMenu } from "./ActionMenu";
import { DeleteClientModal } from "./DeleteClientModal";
import { deleteClient } from "../actions";
import { formatMoney } from "@/lib/invoices/utils";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import { SortableHeader } from "@/components/shared/sortable-header";

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

interface ClientsTableProps {
  clients: Client[];
  workspaceId: string;
  sortBy?: string;
  sortDir?: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ClientsTable({ clients, workspaceId, sortBy, sortDir, searchParams }: ClientsTableProps) {
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

  return (
    <>
      <div className="min-w-full divide-y divide-slate-200">
          {/* Header Row */}
          <div
            className="grid bg-slate-50 border-b border-slate-200"
            style={{
              gridTemplateColumns: "1.5fr 1.2fr 1.6fr 1.2fr 1fr 0.8fr 1fr 0.8fr 0.4fr",
            }}
          >
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              <SortableHeader
                label="Client Name"
                sortKey="client_name"
                workspaceId={workspaceId}
                currentParams={searchParams}
                basePath={`/${workspaceId}/clients`}
              />
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              <SortableHeader
                label="Company"
                sortKey="company"
                workspaceId={workspaceId}
                currentParams={searchParams}
                basePath={`/${workspaceId}/clients`}
              />
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              <SortableHeader
                label="Email"
                sortKey="email"
                workspaceId={workspaceId}
                currentParams={searchParams}
                basePath={`/${workspaceId}/clients`}
              />
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              Phone
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              Payment terms
            </div>
            <div className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              Invoices
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              Outstanding
            </div>
            <div className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              <SortableHeader
                label="Status"
                sortKey="status"
                workspaceId={workspaceId}
                currentParams={searchParams}
                basePath={`/${workspaceId}/clients`}
              />
            </div>
            <div className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">
              Actions
            </div>
          </div>

          {/* Data Rows */}
          {clients.length === 0 && (
            <div
              className="grid px-4 py-6 text-center text-sm text-slate-500"
              style={{
                gridTemplateColumns: "1.5fr 1.2fr 1.6fr 1.2fr 1fr 0.8fr 1fr 0.8fr 0.4fr",
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                No clients found. Try adjusting your filters or search.
              </div>
            </div>
          )}

          {clients.map((client) => {
            const displayStatus =
              client.status === "archived" ? "inactive" : "active";
            const outstanding = client.outstanding ?? 0;
            return (
              <div
                key={client.id}
                className="grid border-b border-slate-100 hover:bg-slate-50 group"
                style={{
                  gridTemplateColumns: "1.5fr 1.2fr 1.6fr 1.2fr 1fr 0.8fr 1fr 0.8fr 0.4fr",
                }}
              >
                <div className="px-4 py-3 text-sm text-slate-900 truncate max-w-full">
                  {client.name}
                </div>
                <div className="px-4 py-3 text-sm text-slate-500 truncate max-w-full">
                  {client.company ?? "—"}
                </div>
                <div className="px-4 py-3 text-sm text-slate-500 truncate max-w-full">
                  {client.email ?? "—"}
                </div>
                <div className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                  {client.whatsapp ?? "—"}
                </div>
                <div className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                  {getPaymentTermsLabel(client.payment_terms)}
                </div>
                <div className="px-4 py-3 text-sm text-right text-slate-500 whitespace-nowrap">
                  {client.invoicesCount ?? 0}
                </div>
                <div
                  className={`px-4 py-3 text-sm text-left font-medium whitespace-nowrap ${
                    outstanding > 0
                      ? "text-red-600"
                      : outstanding < 0
                      ? "text-emerald-600"
                      : "text-slate-900"
                  }`}
                >
                  {formatMoney(Math.abs(outstanding), "USD")}
                </div>
                <div className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      displayStatus === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    {displayStatus}
                  </span>
                </div>
                <div className="px-4 py-3 text-right text-sm whitespace-nowrap">
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
