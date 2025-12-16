export default function PaymentsLoading() {
  return (
    <div className="max-w-5xl mx-auto py-6 space-y-4">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-7 w-32 bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-lg animate-pulse" />
      </div>

      {/* View presets skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-28 bg-slate-200 rounded-full animate-pulse" />
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-24 bg-slate-200 rounded-full animate-pulse" />
          ))}
        </div>
        <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="h-12 bg-slate-50 border-b border-slate-200" />
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div key={i} className="h-16 border-b border-slate-100 bg-white animate-pulse" />
        ))}
      </div>
    </div>
  );
}
