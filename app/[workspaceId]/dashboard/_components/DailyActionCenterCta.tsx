import Link from "next/link";
import { primaryCtaClass } from "@/components/ui/cta-styles";

type DailyActionCenterCtaProps = {
  workspaceId: string;
};

export function DailyActionCenterCta({ workspaceId }: DailyActionCenterCtaProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Today&apos;s Collection Actions</h3>
          <p className="mt-1 text-sm text-slate-500">
            Review the invoices that need collection attention now.
          </p>
        </div>
        <Link href={`/${workspaceId}/actions`} className={primaryCtaClass}>
          Open Action Center →
        </Link>
      </div>
    </div>
  );
}
