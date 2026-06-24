type CardSkeletonProps = {
  className?: string;
};

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

export function CardSkeleton({ className = "" }: CardSkeletonProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-7 w-20 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

export function TableSkeleton({
  rows = 8,
  columns = 6,
  className = "",
}: TableSkeletonProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div
        className="grid border-b border-slate-200 bg-slate-50"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, idx) => (
          <div key={idx} className="px-3 py-3">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid border-b border-slate-100 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <div key={`${rowIdx}-${colIdx}`} className="px-3 py-3">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
