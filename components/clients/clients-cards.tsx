"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { deleteClient } from "@/app/[workspaceId]/clients/actions";
import type { ClientFormValues } from "@/lib/schemas/client";

interface ClientsCardsProps {
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

function CardActionsMenu({
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
          <div className="absolute right-0 top-8 z-20 w-40 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
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

export default function ClientsCards({
  clients,
  workspaceId,
  currentPage,
  totalPages,
  pageSize,
  search,
}: ClientsCardsProps) {
  const router = useRouter();

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", newPage.toString());
    params.set("pageSize", pageSize.toString());
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  const formatPaymentTerms = (terms: string) => {
    const labels: Record<string, string> = {
      due_on_receipt: "Due on Receipt",
      "7_days": "7 Days",
      "14_days": "14 Days",
      "30_days": "30 Days",
      "60_days": "60 Days",
    };
    return labels[terms] || terms;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <div
            key={client.id}
            className="relative rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="absolute right-4 top-4">
              {client.id && (
                <CardActionsMenu
                  clientId={client.id}
                  workspaceId={workspaceId}
                  onDelete={() => router.refresh()}
                />
              )}
            </div>

            <div className="space-y-3 pr-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {client.name}
                </h3>
              </div>

              <div className="space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg
                      className="h-4 w-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span>{client.email}</span>
                  </div>
                )}

                {client.whatsapp && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg
                      className="h-4 w-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <span>{client.whatsapp}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-gray-600">
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{client.country}</span>
                </div>

                <div className="text-gray-600">
                  <span className="font-medium">Payment Terms: </span>
                  {formatPaymentTerms(client.payment_terms || "30_days")}
                </div>

                <div>
                  <StatusPill status={client.status || "active"} />
                </div>
              </div>
            </div>
          </div>
        ))}
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

