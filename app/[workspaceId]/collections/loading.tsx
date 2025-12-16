export default function CollectionsLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-48 bg-slate-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-slate-200 rounded animate-pulse" />
      </div>

      {/* Risk filter skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-28 bg-slate-200 rounded-full animate-pulse" />
        ))}
      </div>

      {/* Stats skeleton */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-6 w-24 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="h-12 bg-slate-50 border-b border-slate-200" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-16 border-b border-slate-100 bg-white animate-pulse" />
        ))}
      </div>
    </div>
  );
}
