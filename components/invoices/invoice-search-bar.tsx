"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface InvoiceSearchBarProps {
  workspaceId: string;
  initialSearch: string;
}

export default function InvoiceSearchBar({
  workspaceId,
  initialSearch,
}: InvoiceSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
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
      router.push(`/${workspaceId}/invoices?${params.toString()}`);
    });
  };

  return (
    <div className="flex-1">
      <input
        type="text"
        placeholder="Search by invoice number or client name..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
      />
    </div>
  );
}
