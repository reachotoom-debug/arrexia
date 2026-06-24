import { TableSkeleton } from "@/components/ui/skeletons";

export default function RemindersLoading() {
  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      <div>
        <div className="mb-2 h-7 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-slate-200" />
        ))}
      </div>

      <TableSkeleton rows={10} columns={7} />
    </div>
  );
}
