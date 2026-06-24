"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/invoices/utils";
import { resolveClientStatus } from "@/lib/clients/state";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import { Eye, Pencil } from "lucide-react";
import { EntityCard } from "@/components/ui/EntityCard";
import { EmptyState } from "@/components/ui/state";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  payment_terms: number | null;
  status: string;
  archived_at: string | null;
  is_active: boolean;
  invoicesCount?: number;
  outstanding?: number;
  hasOverdueInvoices?: boolean;
  is_overdue?: boolean;
}

interface ClientsCardViewProps {
  clients: Client[];
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ClientsCardView({ clients, workspaceId, searchParams }: ClientsCardViewProps) {
  const router = useRouter();

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

  if (!clients.length) {
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
    <>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {clients.map((client) => {
          const displayStatus = resolveClientStatus({
            archived_at: client.archived_at,
            is_active: client.is_active,
          });
          const outstanding = Number(client.outstanding ?? 0);
          const isOverdue = client.is_overdue ?? client.hasOverdueInvoices ?? false;
          const clientHref = `/${workspaceId}/clients/${client.id}`;
          const editHref = returnToUrl
            ? `/${workspaceId}/clients/${client.id}/edit?returnTo=${encodeURIComponent(returnToUrl)}`
            : `/${workspaceId}/clients/${client.id}/edit`;

          const amountColor =
            outstanding > 0
              ? "text-red-600"
              : outstanding < 0
                ? "text-emerald-600"
                : "text-slate-900";

          const phoneTermsParts = [
            client.whatsapp?.trim() || null,
            client.payment_terms ? getPaymentTermsLabel(client.payment_terms) : null,
          ].filter(Boolean) as string[];

          const statusBadge = (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                displayStatus === "archived"
                  ? "bg-slate-100 text-slate-600"
                  : displayStatus === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-50 text-slate-700"
              }`}
            >
              {displayStatus === "active"
                ? "Active"
                : displayStatus === "inactive"
                  ? "Inactive"
                  : "Archived"}
            </span>
          );

          const metaNodes = (
            <>
              {client.email ? (
                <div className="truncate">{client.email}</div>
              ) : null}
              {phoneTermsParts.length > 0 ? (
                <div className="truncate">{phoneTermsParts.join(" · ")}</div>
              ) : null}
            </>
          );

          return (
            <Link
              key={client.id}
              href={clientHref}
              className="group block rounded-2xl transition-all hover:border-slate-300 hover:shadow-sm"
            >
              <EntityCard
                title={client.name}
                subtitle={client.company ?? undefined}
                meta={client.email || phoneTermsParts.length ? metaNodes : undefined}
                amount={
                  <span className={`text-lg font-semibold tabular-nums ${amountColor}`}>
                    {formatMoney(Math.abs(outstanding), "USD")}
                  </span>
                }
                status={statusBadge}
                actions={
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(clientHref);
                      }}
                      className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      aria-label="View client"
                      title="View client"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(editHref);
                      }}
                      className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      aria-label="Edit client"
                      title="Edit client"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                }
              >
                <div className="border-t border-slate-100 pt-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={isOverdue}
                      disabled
                      aria-readonly="true"
                      readOnly
                      className="h-4 w-4 cursor-not-allowed opacity-60"
                    />
                    <span className="text-sm text-muted-foreground">Overdue</span>
                  </div>
                </div>
              </EntityCard>
            </Link>
          );
        })}
      </div>
    </>
  );
}
