"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { deleteClient } from "@/app/[workspaceId]/clients/actions";
import type { ClientFormValues } from "@/lib/schemas/client";

interface ClientsTableProps {
  clients: ClientFormValues[];
  workspaceId: string;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  search: string;
}

function StatusPill({ status }: { status: string }) {
  const colors = {
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    archived: "bg-gray-100 text-gray-800",
  };

  const labels = {
    active: "Active",
    paused: "Paused",
    archived: "Archived",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
        colors[status as keyof typeof colors] || colors.archived
      }`}
    >
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}

function ActionsMenu({
  clientId,
  workspaceId,
  onDelete,
}: {
  clientId: string;
  workspaceId: string;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteClient(workspaceId, clientId);
      onDelete();
    } catch (error) {
      alert("Failed to delete client. Please try again.");
      console.error(error);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label="Actions"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
            <div className="py-1">
              {showConfirm ? (
                <div className="px-4 py-2 text-xs">
                  <p className="mb-2 text-gray-700">Delete this client?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="flex-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowConfirm(false);
                        setIsOpen(false);
                      }}
                      className="flex-1 rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    href={`/${workspaceId}/clients/${clientId}/edit`}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setIsOpen(false)}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ClientsTable({
  clients,
  workspaceId,
  currentPage,
  totalPages,
  pageSize,
  search,
}: ClientsTableProps) {
  const router = useRouter();

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", newPage.toString());
    params.set("pageSize", pageSize.toString());
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Client Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                WhatsApp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Country
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Payment Terms
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {clients.map((client, index) => (
              <tr
                key={client.id}
                className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                  {client.name}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {client.email || "-"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {client.whatsapp || "-"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {client.country}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {client.payment_terms === "due_on_receipt"
                    ? "Due on Receipt"
                    : client.payment_terms === "7_days"
                      ? "7 Days"
                      : client.payment_terms === "14_days"
                        ? "14 Days"
                        : client.payment_terms === "30_days"
                          ? "30 Days"
                          : client.payment_terms === "60_days"
                            ? "60 Days"
                            : client.payment_terms}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  <StatusPill status={client.status || "active"} />
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                  {client.id && (
                    <ActionsMenu
                      clientId={client.id}
                      workspaceId={workspaceId}
                      onDelete={() => router.refresh()}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-gray-700">
            Page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updatePage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => updatePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

