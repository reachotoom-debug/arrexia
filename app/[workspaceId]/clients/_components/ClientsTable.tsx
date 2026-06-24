"use client";



import { useState } from "react";

import { useRouter } from "next/navigation";

import { ActionMenu } from "./ActionMenu";

import { DeleteClientModal } from "./DeleteClientModal";

import { deleteClient } from "../actions";

import { formatMoney } from "@/lib/invoices/utils";

import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";

import { SortableHeader } from "@/components/shared/sortable-header";

import { StatusBadge } from "@/components/ui/StatusBadge";

import { resolveClientStatus } from "@/lib/clients/state";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";



interface Client {

  id: string;

  name: string;

  company: string | null;

  email: string | null;

  whatsapp: string | null;

  country: string | null;

  payment_terms: number | null;

  status: string; // Legacy field, not used for UI status

  archived_at: string | null;

  is_active: boolean;

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



export function ClientsTable({ clients, workspaceId, searchParams }: ClientsTableProps) {

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

      <DataTableShell disableInnerScroll>
      <HorizontalScrollArea
        className="relative w-full min-w-0"
        viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
      >

        <div className={TABLE_MIN_WIDTH_INNER}>

          <table className={`${TABLE_BASE} divide-y divide-slate-200`}>

            <thead className="bg-slate-50">

              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">

                <th className={`${TABLE_CELL_TEXT_COL} px-3 py-3 text-left font-medium`}>

                  <SortableHeader

                    label="Client"

                    sortKey="client_name"

                    workspaceId={workspaceId}

                    currentParams={searchParams}

                    basePath={`/${workspaceId}/clients`}

                  />

                </th>

                <th className="hidden md:table-cell px-3 py-3 text-left font-medium">Phone</th>

                <th className={`hidden lg:table-cell ${TABLE_CELL_TEXT_COL} px-3 py-3 text-left font-medium`}>

                  <SortableHeader

                    label="Company"

                    sortKey="company"

                    workspaceId={workspaceId}

                    currentParams={searchParams}

                    basePath={`/${workspaceId}/clients`}

                  />

                </th>

                <th className="hidden lg:table-cell px-3 py-3 text-left font-medium">Payment terms</th>

                <th className="hidden lg:table-cell px-3 py-3 text-right font-medium">Invoices</th>

                <th className="px-3 py-3 text-right font-medium">Outstanding</th>

                <th className="px-3 py-3 text-left font-medium">

                  <SortableHeader

                    label="Status"

                    sortKey="status"

                    workspaceId={workspaceId}

                    currentParams={searchParams}

                    basePath={`/${workspaceId}/clients`}

                  />

                </th>

                <th className="px-3 py-3 text-right font-medium">Actions</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-100">

              {clients.length === 0 && (

                <tr>

                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">

                    No clients found. Try adjusting your filters or search.

                  </td>

                </tr>

              )}



              {clients.map((client) => {

                const displayStatus = resolveClientStatus({

                  archived_at: client.archived_at,

                  is_active: client.is_active,

                });

                const outstanding = client.outstanding ?? 0;

                return (

                  <tr key={client.id} className="border-b border-slate-100 hover:bg-slate-50">

                    <td className={`${TABLE_CELL_TEXT_COL} px-3 py-3 text-slate-900`}>

                      <div className="font-medium break-words">{client.name}</div>

                      {client.email ? (

                        <div className="mt-0.5 hidden text-slate-500 break-words md:block">{client.email}</div>

                      ) : null}

                    </td>

                    <td className="hidden md:table-cell px-3 py-3 text-slate-500">

                      {client.whatsapp ?? "—"}

                    </td>

                    <td className={`hidden lg:table-cell ${TABLE_CELL_TEXT_COL} px-3 py-3 text-slate-500 break-words`}>

                      {client.company ?? "—"}

                    </td>

                    <td className="hidden lg:table-cell px-3 py-3 text-slate-500">

                      {getPaymentTermsLabel(client.payment_terms)}

                    </td>

                    <td className="hidden lg:table-cell px-3 py-3 text-right text-slate-500 tabular-nums">

                      {client.invoicesCount ?? 0}

                    </td>

                    <td

                      className={`px-3 py-3 text-right text-sm font-medium tabular-nums whitespace-nowrap ${

                        outstanding > 0

                          ? "text-slate-900"

                          : outstanding < 0

                            ? "text-emerald-600"

                            : "text-slate-900"

                      }`}

                    >

                      {formatMoney(Math.abs(outstanding), "USD")}

                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">

                      <StatusBadge type="client" status={displayStatus} />

                    </td>

                    <td className="px-3 py-3 text-right whitespace-nowrap">

                      <ActionMenu

                        clientId={client.id}

                        workspaceId={workspaceId}

                        onDelete={() => handleDeleteClick(client)}

                      />

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </HorizontalScrollArea>
      </DataTableShell>

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



