"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ClientModal from "./client-modal";
import { createClient } from "@/app/[workspaceId]/clients/actions";
import { type ClientFormValues } from "@/lib/schemas/client";

interface ClientSearchBarProps {
  workspaceId: string;
  initialSearch: string;
  initialView: string;
}

export default function ClientSearchBar({
  workspaceId,
  initialSearch,
  initialView,
}: ClientSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [view, setView] = useState(initialView);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to first page on search
    startTransition(() => {
      router.push(`/${workspaceId}/clients?${params.toString()}`);
    });
  };

  const handleViewChange = (newView: string) => {
    setView(newView);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    params.set("page", "1"); // Reset to first page on view change
    startTransition(() => {
      router.push(`/${workspaceId}/clients?${params.toString()}`);
    });
  };

  const handleSubmit = async (values: ClientFormValues) => {
    await createClient(workspaceId, values);
    router.refresh();
  };

  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 border border-slate-300 rounded-lg p-1">
          <button
            type="button"
            onClick={() => handleViewChange("table")}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              view === "table"
                ? "bg-blue-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("cards")}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              view === "cards"
                ? "bg-blue-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Cards
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Add Client
        </button>
      </div>

      <ClientModal
        workspaceId={workspaceId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
}
