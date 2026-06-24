export default function DashboardLoading() {
  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
      </div>

      {/* KPI row – 4–5 cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
              <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="h-6 w-24 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
            <div className="mt-1 h-5 w-full bg-slate-50 rounded-full animate-pulse" />
          </div>
        ))}
      </div>

      {/* Insight banner skeleton */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-80 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="border-b border-slate-200">
        <div className="-mb-px flex space-x-8">
          {["Standard", "AR focus", "Owner overview", "Collections mode"].map(
            (label) => (
              <div
                key={label}
                className="px-1 py-4 text-sm font-medium text-slate-400"
              >
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              </div>
            )
          )}
        </div>
      </div>

      {/* First row: two big cards (charts / risk) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
            <div className="h-64 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Second row: action table + activity feed */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="h-11 bg-slate-50 border-b border-slate-200" />
            {Array.from({ length: 5 }).map((_, row) => (
              <div
                key={row}
                className="h-12 border-b border-slate-100 bg-white animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
