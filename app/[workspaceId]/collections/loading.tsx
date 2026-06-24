import { CardSkeleton, TableSkeleton } from "@/components/ui/skeletons";

export default function CollectionsLoading() {
  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
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
          <CardSkeleton key={i} />
        ))}
      </div>

      <TableSkeleton rows={8} columns={8} />
    </div>
  );
}
