"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteClient } from "@/app/[workspaceId]/clients/actions";
import ClientModal from "./client-modal";
import ViewClientModal from "./view-client-modal";
import DeleteConfirmModal from "./delete-confirm-modal";
import ActionMenu from "./action-menu";
import SortableHeader from "./sortable-header";
import { updateClient } from "@/app/[workspaceId]/clients/actions";
import { type ClientFormValues } from "@/lib/schemas/client";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";

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
}

interface ClientsListProps {
  clients: Client[];
  workspaceId: string;
  view: string;
  currentPage: number;
  totalPages: number;
  currentSort: string;
  currentDirection: "asc" | "desc";
}

export default function ClientsList({
  clients,
  workspaceId,
  view,
  currentPage,
  totalPages,
  currentSort,
  currentDirection,
}: ClientsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [clientInvoices, setClientInvoices] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  const handleSort = (sortKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const newDirection =
      currentSort === sortKey && currentDirection === "asc" ? "desc" : "asc";
    params.set("sort", sortKey);
    params.set("direction", newDirection);
    params.set("page", "1");
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  const handleEdit = async (values: ClientFormValues) => {
    if (editingClient) {
      await updateClient(workspaceId, editingClient.id, values);
      setEditingClient(null);
      router.refresh();
    }
  };

  const handleView = async (client: Client) => {
    setViewingClient(client);
    setIsLoadingInvoices(true);
    try {
      const response = await fetch(
        `/${workspaceId}/clients/${client.id}/invoices`
      );
      if (response.ok) {
        const data = await response.json();
        setClientInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error("Failed to load invoices", error);
      setClientInvoices([]);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const handleDelete = async () => {
    if (deletingClient) {
      try {
        await deleteClient(workspaceId, deletingClient.id);
        setDeletingClient(null);
        router.refresh();
      } catch (error) {
        alert("Failed to delete client");
      }
    }
  };

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    ) : (
      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-800">
        Archived
      </span>
    );
  };

  // Card View
  if (view === "cards") {
    return (
      <>
        {clients.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 shadow-sm">
            <div className="max-w-md mx-auto">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No clients yet
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Get started by adding your first client
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 pr-2">
                      <h3 className="font-semibold text-slate-900 text-lg">
                        {client.name}
                      </h3>
                      {client.company && (
                        <p className="text-sm text-slate-600 mt-1">
                          {client.company}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(client.status)}
                      <ActionMenu
                        onView={() => handleView(client)}
                        onEdit={() => setEditingClient(client)}
                        onDelete={() => setDeletingClient(client)}
                        align="right"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    {client.email && (
                      <p className="flex items-center gap-2 truncate">
                        <span>📧</span>
                        <span className="truncate">{client.email}</span>
                      </p>
                    )}
                    {client.whatsapp && (
                      <p className="flex items-center gap-2">
                        <span>📱</span>
                        <span>{client.whatsapp}</span>
                      </p>
                    )}
                    {client.country && (
                      <p className="flex items-center gap-2">
                        <span>🌍</span>
                        <span>{client.country}</span>
                      </p>
                    )}
                    {client.payment_terms !== null &&
                      client.payment_terms !== undefined && (
                        <p className="flex items-center gap-2">
                          <span>💰</span>
                          <span>
                            {getPaymentTermsLabel(client.payment_terms)}
                          </span>
                        </p>
                      )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination for cards */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
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
          </>
        )}

        {editingClient && (
          <ClientModal
            workspaceId={workspaceId}
            isOpen={!!editingClient}
            onClose={() => setEditingClient(null)}
            initialValues={editingClient}
            onSubmit={handleEdit}
          />
        )}

        {viewingClient && (
          <ViewClientModal
            isOpen={!!viewingClient}
            client={viewingClient}
            invoices={clientInvoices}
            workspaceId={workspaceId}
            onClose={() => {
              setViewingClient(null);
              setClientInvoices([]);
            }}
            onEdit={() => {
              setViewingClient(null);
              setEditingClient(viewingClient);
            }}
            onDelete={() => {
              setViewingClient(null);
              setDeletingClient(viewingClient);
            }}
          />
        )}

        {deletingClient && (
          <DeleteConfirmModal
            isOpen={!!deletingClient}
            clientName={deletingClient.name}
            onConfirm={handleDelete}
            onCancel={() => setDeletingClient(null)}
          />
        )}
      </>
    );
  }

  // Table View
  return (
    <>
      {clients.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-slate-200 shadow-sm">
          <div className="max-w-md mx-auto">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No clients yet
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              Get started by adding your first client
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <SortableHeader
                    label="Client"
                    sortKey="name"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    onSort={handleSort}
                  />
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Company
                  </th>
                  <SortableHeader
                    label="Email"
                    sortKey="email"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    onSort={handleSort}
                  />
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    WhatsApp
                  </th>
                  <SortableHeader
                    label="Country"
                    sortKey="country"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    onSort={handleSort}
                  />
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Payment Terms
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <SortableHeader
                    label="Created"
                    sortKey="created_at"
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
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900">
                        {client.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {client.company || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {client.email || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {client.whatsapp || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {client.country || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {getPaymentTermsLabel(client.payment_terms)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(client.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {client.created_at
                        ? new Date(client.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <ActionMenu
                        onView={() => handleView(client)}
                        onEdit={() => setEditingClient(client)}
                        onDelete={() => setDeletingClient(client)}
                        align="right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
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
        </>
      )}

      {editingClient && (
        <ClientModal
          workspaceId={workspaceId}
          isOpen={!!editingClient}
          onClose={() => setEditingClient(null)}
          initialValues={editingClient}
          onSubmit={handleEdit}
        />
      )}

      {viewingClient && (
        <ViewClientModal
          isOpen={!!viewingClient}
          client={viewingClient}
          invoices={clientInvoices}
          workspaceId={workspaceId}
          onClose={() => {
            setViewingClient(null);
            setClientInvoices([]);
          }}
          onEdit={() => {
            setViewingClient(null);
            setEditingClient(viewingClient);
          }}
          onDelete={() => {
            setViewingClient(null);
            setDeletingClient(viewingClient);
          }}
        />
      )}

      {deletingClient && (
        <DeleteConfirmModal
          isOpen={!!deletingClient}
          clientName={deletingClient.name}
          onConfirm={handleDelete}
          onCancel={() => setDeletingClient(null)}
        />
      )}
    </>
  );
}
