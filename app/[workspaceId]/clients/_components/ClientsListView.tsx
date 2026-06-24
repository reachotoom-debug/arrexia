"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { SortableHeader } from "@/components/shared/sortable-header";
import { resolveClientStatus } from "@/lib/clients/state";
import { ClientRowActions } from "./ClientRowActions";
import { ClientsBulkActions } from "./ClientsBulkActions";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_ACTIONS_ROW,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_CENTER,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { EmptyState } from "@/components/ui/state";

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label="Select all clients"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-foreground"
    />
  );
}

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
  hasOverdueInvoices?: boolean;
  is_overdue?: boolean;
}

interface ClientsListViewProps {
  clients: Client[];
  workspaceId: string;
  sortBy?: string;
  sortDir?: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ClientsListView({ clients, workspaceId, sortBy, sortDir, searchParams }: ClientsListViewProps) {
  // Build returnTo URL from current searchParams for edit links
  const returnToUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else {
          params.set(key, value);
        }
      }
    });
    return `/${workspaceId}/clients${params.toString() ? `?${params.toString()}` : ""}`;
  }, [workspaceId, searchParams]);
  const router = useRouter();
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map((c) => c.id)));
    }
  };

  const allSelected = clients.length > 0 && selectedIds.size === clients.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < clients.length;

  if (clients.length === 0) {
    return (
      <EmptyState
        bare
        title="No clients match your filters"
        message="Try clearing filters or search to see more clients."
        actionLabel="View all clients"
        actionHref={`/${workspaceId}/clients`}
      />
    );
  }

  return (
    <div className="w-full">
      <ClientsBulkActions
        workspaceId={workspaceId}
        clients={clients}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
        <DataTableShell disableInnerScroll>
        <HorizontalScrollArea className="relative w-full min-w-0" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
          <div className={TABLE_MIN_WIDTH_INNER}>
          <table className={`${TABLE_BASE} border-separate border-spacing-0`}>
            <colgroup>
              <col className="w-[48px]" />
              <col />
              <col className="w-[160px]" />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              <col className="w-[88px]" />
            </colgroup>
            
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="border-b border-slate-200">
                {/* Selection */}
                <th className={`bg-white ${TABLE_TH}`}>
                  <SelectAllCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAllVisible}
                  />
                </th>
                
                {/* Client */}
                <th className={`bg-white ${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
                  <SortableHeader
                    label="Client"
                    sortKey="client_name"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/clients`}
                  />
                </th>
                
                {/* Outstanding */}
                <th className={`bg-white ${TABLE_TH_RIGHT}`}>
                  <SortableHeader
                    label="Outstanding"
                    sortKey="outstanding"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/clients`}
                    align="right"
                  />
                </th>
                
                {/* Overdue */}
                <th className={`hidden lg:table-cell bg-white ${TABLE_TH_CENTER}`}>
                  Overdue
                </th>
                
                {/* Status */}
                <th className={`bg-white ${TABLE_TH_CENTER}`}>
                  Status
                </th>
                
                {/* Actions */}
                <th className={`bg-white ${TABLE_TH_RIGHT}`}>
                  Actions
                </th>
              </tr>
            </thead>
            
            <tbody>
              {clients.map((client) => {
                const displayStatus = resolveClientStatus({
                  archived_at: client.archived_at,
                  is_active: client.is_active,
                });
                const outstanding = client.outstanding ?? 0;
                const isOverdue = client.is_overdue ?? client.hasOverdueInvoices ?? false;
                
                const emailLine = client.email?.trim() || null;
                
                return (
                  <tr
                    key={client.id}
                    className={`${TABLE_ROW} cursor-pointer`}
                    onClick={() => router.push(`/${workspaceId}/clients/${client.id}`)}
                  >
                    {/* Selection */}
                    <td
                      className={TABLE_TD}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${client.name}`}
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleOne(client.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer accent-foreground"
                      />
                    </td>
                    
                    {/* Client - name + email (email from md up) */}
                    <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD}`}>
                      <div className="space-y-0.5">
                        <div className="break-words font-medium text-slate-900">
                          {client.name}
                        </div>
                        {emailLine ? (
                          <div className="hidden break-words text-xs text-slate-500 md:block">
                            {emailLine}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    
                    {/* Outstanding */}
                    <td className={TABLE_TD_RIGHT}>
                      <div
                        className={`text-base font-semibold tabular-nums ${
                          outstanding > 0
                            ? "text-red-600"
                            : "text-slate-700"
                        }`}
                      >
                        {formatMoney(Math.abs(outstanding), "USD")}
                      </div>
                    </td>
                    
                    {/* Overdue */}
                    <td className={`hidden lg:table-cell ${TABLE_TD} text-center`} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isOverdue}
                        disabled
                        aria-readonly="true"
                        className="h-4 w-4 cursor-not-allowed opacity-60"
                        readOnly
                      />
                    </td>
                    
                    {/* Status */}
                    <td className={`${TABLE_TD} text-center`} onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`inline-flex rounded-full border px-1.5 py-0.5 text-xs font-medium capitalize ${
                          displayStatus === "archived"
                            ? "bg-slate-100 text-slate-600 border-slate-300"
                            : displayStatus === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    
                    {/* Actions */}
                    <td
                      className={`${TABLE_TD} text-right`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={TABLE_ACTIONS_ROW}>
                        <ClientRowActions clientId={client.id} workspaceId={workspaceId} returnToUrl={returnToUrl} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </HorizontalScrollArea>
        </DataTableShell>
    </div>
  );
}
