const KPI_ITEMS = [
  { label: "Total Invoices", value: "248", tone: "text-slate-900" },
  { label: "Paid", value: "$84.2k", tone: "text-emerald-600" },
  { label: "Outstanding", value: "$31.5k", tone: "text-blue-600" },
  { label: "Overdue", value: "$9.8k", tone: "text-rose-600" },
] as const;

const RECENT_INVOICES = [
  { client: "Northwind Studio", amount: "$4,200", status: "Overdue", tone: "bg-rose-50 text-rose-700" },
  { client: "Brightline Co.", amount: "$2,850", status: "Sent", tone: "bg-blue-50 text-blue-700" },
  { client: "Summit Legal", amount: "$1,640", status: "Paid", tone: "bg-emerald-50 text-emerald-700" },
  { client: "Atlas Consulting", amount: "$980", status: "Due soon", tone: "bg-amber-50 text-amber-700" },
] as const;

const CASH_FLOW_BARS = [42, 58, 48, 72, 65, 80, 74] as const;

const REMINDERS = [
  { title: "Invoice #1042 — 7 days overdue", when: "Today" },
  { title: "Invoice #1038 — payment due", when: "Tomorrow" },
  { title: "Follow-up — Summit Legal", when: "Wed" },
] as const;

const SIDEBAR_ITEMS = ["Dashboard", "Clients", "Invoices", "Payments", "Collections"] as const;

export function DashboardMockup() {
  return (
      <div
        className="relative mx-auto w-full max-w-xl lg:max-w-none"
        role="img"
        aria-label="Preview of the Arrexia accounts receivable dashboard showing invoices, cash flow, and payment reminders"
      >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-violet-500/20 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex min-h-[420px] sm:min-h-[480px]">
          <aside className="hidden w-14 shrink-0 flex-col gap-2 border-r border-slate-800 bg-slate-950 p-2 sm:flex sm:w-16 sm:p-3">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white">
              A
            </div>
            {SIDEBAR_ITEMS.map((item, index) => (
              <div
                key={item}
                className={`rounded-lg px-2 py-2 text-[9px] font-medium leading-tight ${
                  index === 0
                    ? "bg-indigo-600/20 text-indigo-200"
                    : "text-slate-500"
                }`}
              >
                {item.slice(0, 3)}
              </div>
            ))}
          </aside>

          <div className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                  Dashboard
                </p>
                <p className="text-sm font-semibold text-slate-900 sm:text-base">
                  Cash flow overview
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                Healthy AR
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {KPI_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3"
                >
                  <p className="text-[10px] text-slate-500">{item.label}</p>
                  <p className={`mt-1 text-sm font-semibold sm:text-base ${item.tone}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:col-span-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-900">Recent invoices</p>
                  <span className="text-[10px] text-slate-600">This month</span>
                </div>
                <ul className="space-y-2">
                  {RECENT_INVOICES.map((row) => (
                    <li
                      key={row.client}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {row.client}
                        </p>
                        <p className="text-[10px] text-slate-500">{row.amount}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${row.tone}`}
                      >
                        {row.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3 lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold text-slate-900">Cash flow trend</p>
                  <div className="mt-3 flex h-20 items-end gap-1.5">
                    {CASH_FLOW_BARS.map((height, index) => (
                      <div
                        key={index}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-600 to-cyan-400"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold text-slate-900">Upcoming reminders</p>
                  <ul className="mt-2 space-y-2">
                    {REMINDERS.map((item) => (
                      <li key={item.title} className="rounded-lg border border-slate-100 px-2 py-1.5">
                        <p className="text-[10px] font-medium text-slate-800">{item.title}</p>
                        <p className="text-[10px] text-slate-500">{item.when}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
