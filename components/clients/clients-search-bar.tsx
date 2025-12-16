"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

interface ClientsSearchBarProps {
  workspaceId: string;
  initialSearch: string;
  initialView: string;
}

export default function ClientsSearchBar({
  workspaceId,
  initialSearch,
  initialView,
}: ClientsSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [view, setView] = useState(initialView);

  useEffect(() => {
    setSearch(initialSearch);
    setView(initialView);
  }, [initialSearch, initialView]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to page 1 on new search
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  const handleViewChange = (newView: string) => {
    setView(newView);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    router.push(`/${workspaceId}/clients?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSearch} className="flex-1">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or WhatsApp..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Search
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => handleViewChange("table")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              view === "table"
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("cards")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              view === "cards"
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Cards
          </button>
        </div>

        <Link
          href={`/${workspaceId}/clients/new`}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Add client
        </Link>
      </div>
    </div>
  );
}

