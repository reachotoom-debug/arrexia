import { TableSkeleton } from "@/components/ui/skeletons";
import type { ReactNode } from "react";

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${className}`}
      aria-hidden="true"
    />
  );
}

function CardSection({
  titleWidth,
  children,
}: {
  titleWidth: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <SkeletonBar className={`mb-3 h-4 ${titleWidth}`} />
      {children}
    </div>
  );
}

function DetailRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-1">
      <SkeletonBar className="h-3 w-24" />
      <SkeletonBar className="h-3 w-28" />
    </div>
  );
}

export function InvoiceDetailLoadingSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl min-w-0 space-y-6"
      aria-busy="true"
      aria-label="Loading invoice"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-14" />
          <SkeletonBar className="h-8 w-44" />
          <SkeletonBar className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBar key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      </div>

      {/* From / Bill To */}
      <div className="grid gap-4 md:grid-cols-2">
        {["w-12", "w-16"].map((titleWidth) => (
          <CardSection key={titleWidth} titleWidth={titleWidth}>
            <SkeletonBar className="mb-2 h-4 w-36" />
            <div className="space-y-2">
              <SkeletonBar className="h-3 w-full max-w-xs" />
              <SkeletonBar className="h-3 w-full max-w-[14rem]" />
              <SkeletonBar className="h-3 w-full max-w-[10rem]" />
            </div>
          </CardSection>
        ))}
      </div>

      {/* Invoice Details / Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardSection titleWidth="w-28">
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <DetailRowSkeleton key={i} />
            ))}
          </div>
        </CardSection>
        <CardSection titleWidth="w-20">
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <DetailRowSkeleton key={i} />
            ))}
            <div className="mt-2 border-t border-slate-200 pt-2">
              <DetailRowSkeleton />
            </div>
            <DetailRowSkeleton />
            <div className="mt-2 border-t border-slate-200 pt-2">
              <DetailRowSkeleton />
            </div>
          </div>
        </CardSection>
      </div>

      {/* Line Items */}
      <CardSection titleWidth="w-24">
        <TableSkeleton rows={4} columns={5} />
      </CardSection>

      {/* Payment History */}
      <CardSection titleWidth="w-32">
        <TableSkeleton rows={2} columns={5} />
      </CardSection>

      {/* Timeline */}
      <CardSection titleWidth="w-32">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <SkeletonBar className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-40" />
                <SkeletonBar className="h-3 w-32" />
                <SkeletonBar className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </CardSection>

      {/* Thank you / Payment details */}
      <div className="grid gap-4 md:grid-cols-2">
        {["w-24", "w-28"].map((titleWidth) => (
          <CardSection key={titleWidth} titleWidth={titleWidth}>
            <div className="space-y-2">
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-3 w-full max-w-md" />
              <SkeletonBar className="h-3 w-full max-w-sm" />
            </div>
          </CardSection>
        ))}
      </div>
    </div>
  );
}
