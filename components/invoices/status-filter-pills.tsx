"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface StatusFilterPillsProps {
  workspaceId: string;
  currentStatus: string;
}

const statusFilters = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

export default function StatusFilterPills({
  workspaceId,
  currentStatus,
}: StatusFilterPillsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.set("page", "1"); // Reset to first page
    startTransition(() => {
      router.push(`/${workspaceId}/invoices?${params.toString()}`);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {statusFilters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => handleStatusChange(filter.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            currentStatus === filter.value
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

