import { TableSkeleton } from "@/components/ui/skeletons";

export default function ClientsLoading() {
  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-7 w-32 bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 bg-slate-200 rounded-full animate-pulse" />
        ))}
      </div>

      <TableSkeleton rows={10} columns={8} />
    </div>
  );
}
