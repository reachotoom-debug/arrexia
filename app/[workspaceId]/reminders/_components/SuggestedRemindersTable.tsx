"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/utils/format-money";
import { SendReminderButton } from "./send-reminder-button";
import { EmptyState } from "@/components/ui/state";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { EntityCard } from "@/components/ui/EntityCard";

type SuggestedRow = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding: number | null;
  currency: string | null;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  days_from_due: number | null;
  tag: string;
  is_overdue: boolean;
  client_name: string | null;
  client_email: string | null;
  rule_id: string;
  rule_name: string;
  rule_label: string;
  template_id: string | null;
};

interface SuggestedRemindersTableProps {
  workspaceId: string;
  reminders: SuggestedRow[];
  searchParams?: Record<string, string | string[] | undefined>;
}

function buildSortUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  sortKey: string,
  currentSort?: string,
  currentDir?: string
): string {
  const params = new URLSearchParams();
  
  // Preserve existing meaningful params
  const meaningfulParams = ["search", "page"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue && strValue !== "default" && strValue !== "all") {
        params.set(key, strValue);
      }
    }
  });

  // Determine next direction
  const isActive = currentSort === sortKey;
  const nextDir = !isActive ? "asc" : currentDir === "asc" ? "desc" : "asc";

  // Set sort params (default is due_date asc, so only include if different)
  if (sortKey === "due_date" && nextDir === "asc") {
    // Default sort, don't include in URL
  } else {
    params.set("sort", sortKey);
    params.set("dir", nextDir);
  }

  // Reset page when sorting
  params.delete("page");

  const queryString = params.toString();
  return `/${workspaceId}/reminders${queryString ? `?${queryString}` : ""}`;
}

function SortableHeader({
  label,
  sortKey,
  workspaceId,
  currentParams,
  align = "left",
}: {
  label: string;
  sortKey: string;
  workspaceId: string;
  currentParams: Record<string, string | string[] | undefined>;
  align?: "left" | "right";
}) {
  const currentSort = currentParams.sort
    ? (Array.isArray(currentParams.sort) ? currentParams.sort[0] : currentParams.sort)
    : undefined;
  const currentDir = currentParams.dir
    ? (Array.isArray(currentParams.dir) ? currentParams.dir[0] : currentParams.dir)
    : undefined;

  const isActive = currentSort === sortKey;
  const nextDir = !isActive ? "asc" : currentDir === "asc" ? "desc" : "asc";

  const icon = !isActive
    ? "↕"
    : currentDir === "asc"
    ? "↑"
    : "↓";

  const href = buildSortUrl(workspaceId, currentParams, sortKey, currentSort, currentDir);

  const baseClass = "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors cursor-pointer hover:text-slate-900";
  const colorClass = isActive ? "text-slate-900" : "text-slate-500";
  const justifyClass = align === "right" ? "justify-end" : "justify-start";

  return (
    <Link href={href} className={`${baseClass} ${colorClass} ${justifyClass}`}>
      <span>{label}</span>
      <span className="text-[10px]">{icon}</span>
    </Link>
  );
}

export function SuggestedRemindersTable({
  workspaceId,
  reminders,
  searchParams = {},
}: SuggestedRemindersTableProps) {
  const currentParams = searchParams;

  if (reminders.length === 0) {
    return (
      <EmptyState
        title="No reminders match your search"
        message="Try a different search term."
        actionLabel="Clear search"
        actionHref={`/${workspaceId}/reminders`}
      />
    );
  }

  return (
    <>
      <div className="mt-2 space-y-2 md:hidden">
        {reminders.map((inv) => {
          const currency = inv.currency || "USD";
          const outstanding = Number(inv.outstanding ?? 0);
          const daysFromDue = inv.days_from_due ?? 0;

          const overdueLabel =
            daysFromDue > 0 ? (
              <span className="font-medium text-red-600">
                {daysFromDue} day{daysFromDue === 1 ? "" : "s"} overdue
              </span>
            ) : daysFromDue < 0 ? (
              <span>
                Due in {Math.abs(daysFromDue)} day
                {Math.abs(daysFromDue) === 1 ? "" : "s"}
              </span>
            ) : (
              <span>Due today</span>
            );

          return (
            <EntityCard
              key={`m-${inv.id}`}
              title={
                <Link
                  href={`/${workspaceId}/invoices/${inv.invoice_id}`}
                  className="text-base font-semibold text-blue-600 hover:underline"
                >
                  {inv.invoice_number ?? inv.invoice_id.slice(0, 8)}
                </Link>
              }
              subtitle={
                inv.client_name || inv.client_email ? (
                  <span className="break-words font-normal text-muted-foreground">
                    {inv.client_name || inv.client_email}
                  </span>
                ) : (
                  "—"
                )
              }
              meta={
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="font-medium text-slate-700">
                    {inv.rule_name} · {inv.rule_label}
                  </div>
                  <div>
                    Due{" "}
                    {inv.due_date
                      ? new Date(inv.due_date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </div>
                  <div>{overdueLabel}</div>
                  {inv.client_email && inv.client_name ? (
                    <div className="truncate text-[11px]">{inv.client_email}</div>
                  ) : null}
                </div>
              }
              amount={
                <span className="text-lg font-semibold tabular-nums text-slate-900">
                  {formatMoney(outstanding, currency)}
                </span>
              }
              status={<StatusBadge type="invoice" status={inv.status ?? "sent"} />}
              actions={
                <SendReminderButton
                  workspaceId={workspaceId}
                  invoiceId={inv.invoice_id}
                  invoiceNumber={inv.invoice_number}
                  clientName={inv.client_name ?? undefined}
                  clientEmail={inv.client_email ?? undefined}
                  ruleId={inv.rule_id}
                  templateId={inv.template_id}
                />
              }
            />
          );
        })}
      </div>
      <DataTableShell className="hidden md:block" disableInnerScroll>
      <HorizontalScrollArea
        className="relative w-full min-w-0"
        viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
      >
      <div className={TABLE_MIN_WIDTH_INNER}>
      <table className={TABLE_BASE}>
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className={`${TABLE_TH} whitespace-nowrap`}>Invoice #</th>
            <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
              <SortableHeader
                label="CLIENT"
                sortKey="client_name"
                workspaceId={workspaceId}
                currentParams={currentParams}
                align="left"
              />
            </th>
            <th className={`hidden md:table-cell ${TABLE_TH}`}>
              <SortableHeader
                label="DUE DATE"
                sortKey="due_date"
                workspaceId={workspaceId}
                currentParams={currentParams}
                align="left"
              />
            </th>
            <th className={`hidden md:table-cell ${TABLE_TH}`}>
              <SortableHeader
                label="DAYS OVERDUE"
                sortKey="days_overdue"
                workspaceId={workspaceId}
                currentParams={currentParams}
                align="left"
              />
            </th>
            <th className={TABLE_TH_RIGHT}>
              <SortableHeader
                label="OUTSTANDING"
                sortKey="outstanding"
                workspaceId={workspaceId}
                currentParams={currentParams}
                align="right"
              />
            </th>
            <th className={`${TABLE_TH} pl-4`}>Status</th>
            <th className={`hidden lg:table-cell ${TABLE_TH}`}>
              <SortableHeader
                label="RULE"
                sortKey="rule_name"
                workspaceId={workspaceId}
                currentParams={currentParams}
                align="left"
              />
            </th>
            <th className={TABLE_TH_RIGHT}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reminders.map((inv) => {
            const currency = inv.currency || "USD";
            const outstanding = Number(inv.outstanding ?? 0);
            const daysFromDue = inv.days_from_due ?? 0;

            return (
              <tr key={inv.id} className={TABLE_ROW}>
                {/* INVOICE # (link) */}
                <td className={`${TABLE_TD} text-sm whitespace-nowrap`}>
                  <Link
                    href={`/${workspaceId}/invoices/${inv.invoice_id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {inv.invoice_number ?? inv.invoice_id.slice(0, 8)}
                  </Link>
                </td>

                {/* CLIENT (name + email) */}
                <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD} text-sm`}>
                  {inv.client_name || inv.client_email ? (
                    <>
                      {inv.client_name && (
                        <div className="break-words text-sm font-medium text-slate-900">
                          {inv.client_name}
                        </div>
                      )}
                      {inv.client_email && (
                        <div className="hidden break-words text-xs text-slate-500 md:block">
                          {inv.client_email}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </td>

                {/* DUE DATE – left aligned */}
                <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                  {inv.due_date
                    ? new Date(inv.due_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>

                {/* DAYS OVERDUE – left aligned */}
                <td className={`hidden md:table-cell ${TABLE_TD} text-sm`}>
                  {daysFromDue > 0 ? (
                    <span className="font-medium text-red-600">
                      {daysFromDue} day{daysFromDue === 1 ? "" : "s"} overdue
                    </span>
                  ) : daysFromDue < 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Due in {Math.abs(daysFromDue)} day
                      {Math.abs(daysFromDue) === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Due today
                    </span>
                  )}
                </td>

                {/* OUTSTANDING – right aligned */}
                <td className={`${TABLE_TD_RIGHT} text-sm text-slate-700`}>
                  {formatMoney(outstanding, currency)}
                </td>

                {/* STATUS – left aligned with a soft pill */}
                <td className={`${TABLE_TD} whitespace-nowrap pl-4`}>
                  <StatusBadge type="invoice" status={inv.status ?? "sent"} />
                </td>

                <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                  <div className="font-medium text-slate-900">{inv.rule_name}</div>
                  <div className="text-xs text-slate-500">{inv.rule_label}</div>
                </td>

                {/* ACTIONS – center aligned for icon */}
                <td className={`${TABLE_TD_RIGHT} whitespace-nowrap`}>
                  <div className={TABLE_ACTIONS_ROW}>
                    <SendReminderButton
                      workspaceId={workspaceId}
                      invoiceId={inv.invoice_id}
                      invoiceNumber={inv.invoice_number}
                      clientName={inv.client_name ?? undefined}
                      clientEmail={inv.client_email ?? undefined}
                      ruleId={inv.rule_id}
                      templateId={inv.template_id}
                    />
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
    </>
  );
}
