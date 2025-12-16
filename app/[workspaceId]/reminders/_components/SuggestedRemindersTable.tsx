import Link from "next/link";
import { formatMoney } from "@/lib/utils/format-money";
import { SendReminderButton } from "../SendReminderButton";

type SuggestedRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding_amount: number | null;
  currency: string | null;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  days_from_due: number | null;
  tag: string;
  is_overdue: boolean;
};

interface SuggestedRemindersTableProps {
  workspaceId: string;
  reminders: SuggestedRow[];
}

export function SuggestedRemindersTable({
  workspaceId,
  reminders,
}: SuggestedRemindersTableProps) {
  if (reminders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <div className="mb-3 rounded-full bg-muted p-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No reminders match your current filters
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try clearing filters to view more reminders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <table className="min-w-full table-auto text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left">INVOICE #</th>
            <th className="px-3 py-2 text-left">CLIENT</th>
            <th className="px-3 py-2 text-left">DUE DATE</th>
            <th className="px-3 py-2 text-left">DAYS OVERDUE</th>
            <th className="px-3 py-2 text-right">OUTSTANDING</th>
            <th className="px-3 py-2 pl-8 text-left">STATUS</th>
            <th className="px-3 py-2 text-right">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reminders.map((inv) => {
            const currency = inv.currency || "USD";
            const outstanding = Number(inv.outstanding_amount ?? 0);
            const daysFromDue = inv.days_from_due ?? 0;

            return (
              <tr
                key={inv.id}
                className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
              >
                {/* INVOICE # (link) */}
                <td className="px-3 py-3 align-middle">
                  <Link
                    href={`/${workspaceId}/invoices/${inv.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {inv.invoice_number ?? inv.id.slice(0, 8)}
                  </Link>
                </td>

                {/* CLIENT (name + email) */}
                <td className="px-3 py-3 align-middle">
                  <div className="text-sm font-medium">
                    {inv.client?.name ?? "—"}
                  </div>
                  {inv.client?.email && (
                    <div className="text-xs text-muted-foreground">
                      {inv.client.email}
                    </div>
                  )}
                </td>

                {/* DUE DATE – left aligned */}
                <td className="px-3 py-3 align-middle text-sm text-slate-700">
                  {inv.due_date
                    ? new Date(inv.due_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>

                {/* DAYS OVERDUE – left aligned */}
                <td className="px-3 py-3 align-middle text-sm">
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
                <td className="px-3 py-3 align-middle pr-2 text-right text-sm text-slate-700">
                  {formatMoney(outstanding, currency)}
                </td>

                {/* STATUS – left aligned with a soft pill */}
                <td className="px-3 py-3 align-middle pl-8">
                  {(() => {
                    const status = (inv.status || "").toLowerCase();
                    const statusStyles: Record<string, string> = {
                      draft: "bg-slate-100 text-slate-700",
                      sent: "bg-blue-100 text-blue-700",
                      paid: "bg-emerald-100 text-emerald-700",
                      partially_paid: "bg-amber-100 text-amber-700",
                      overdue: "bg-red-100 text-red-700",
                      void: "bg-neutral-100 text-neutral-600",
                    };
                    const statusStyle =
                      statusStyles[status] || "bg-slate-100 text-slate-700";
                    return (
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyle}`}
                      >
                        {status.replace("_", " ") || "—"}
                      </span>
                    );
                  })()}
                </td>

                {/* ACTIONS – right aligned */}
                <td className="px-3 py-3 align-middle text-right">
                  <SendReminderButton
                    workspaceId={workspaceId}
                    invoiceId={inv.id}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

