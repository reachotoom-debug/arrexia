import { TableSkeleton } from "@/components/ui/skeletons";

type InvoiceFormLoadingSkeletonProps = {
  mode: "create" | "edit";
};

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${className}`}
      aria-hidden="true"
    />
  );
}

function FieldSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-1.5">
      <SkeletonBar className="h-3 w-20" />
      <SkeletonBar className={`h-10 w-full ${wide ? "" : ""}`} />
    </div>
  );
}

export function InvoiceFormLoadingSkeleton({ mode }: InvoiceFormLoadingSkeletonProps) {
  const isEdit = mode === "edit";

  return (
    <div
      className="mx-auto w-full max-w-6xl min-w-0 space-y-6"
      aria-busy="true"
      aria-label={isEdit ? "Loading invoice editor" : "Loading new invoice form"}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-40" />
          <SkeletonBar className="h-4 w-72" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBar className="h-10 w-24 rounded-lg" />
          {isEdit ? (
            <SkeletonBar className="h-10 w-32 rounded-lg" />
          ) : (
            <>
              <SkeletonBar className="h-10 w-32 rounded-lg" />
              <SkeletonBar className="h-10 w-40 rounded-lg" />
            </>
          )}
        </div>
      </div>

      {/* Invoice Details + Client */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SkeletonBar className="h-4 w-28" />
          <FieldSkeleton />
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <FieldSkeleton />
          <FieldSkeleton />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SkeletonBar className="h-4 w-16" />
          <FieldSkeleton />
          <div className="space-y-1.5">
            <SkeletonBar className="h-3 w-12" />
            <SkeletonBar className="h-24 w-full rounded-lg" />
            <SkeletonBar className="h-3 w-56" />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-8 w-24 rounded-lg" />
        </div>
        <TableSkeleton rows={3} columns={6} />
      </div>

      {/* Totals */}
      <div className="flex flex-col items-end gap-3">
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-4 w-16" />
            <SkeletonBar className="h-4 w-20" />
          </div>
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-4 w-20" />
            <SkeletonBar className="h-4 w-16" />
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
            <SkeletonBar className="h-5 w-12" />
            <SkeletonBar className="h-6 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
