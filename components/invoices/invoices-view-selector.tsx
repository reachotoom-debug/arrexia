"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { INVOICE_VIEWS, type InvoiceViewId } from "@/lib/schemas/invoice";

interface InvoicesViewSelectorProps {
  workspaceId: string;
  currentView: InvoiceViewId;
}

export default function InvoicesViewSelector({
  workspaceId,
  currentView,
}: InvoicesViewSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleViewChange = (view: InvoiceViewId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    params.set("page", "1");
    router.push(`/${workspaceId}/invoices?${params.toString()}`);
  };

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
      {INVOICE_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => handleViewChange(view.id)}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            currentView === view.id
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

