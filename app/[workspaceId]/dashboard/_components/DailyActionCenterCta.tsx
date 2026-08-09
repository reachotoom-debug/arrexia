import Link from "next/link";
import { primaryCtaClass } from "@/components/ui/cta-styles";

type DailyActionCenterCtaProps = {
  workspaceId: string;
  remindersReadyCount: number;
};

export function DailyActionCenterCta({
  workspaceId,
  remindersReadyCount,
}: DailyActionCenterCtaProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Today&apos;s Collection Actions
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Review what needs collection attention now.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/${workspaceId}/reminders`}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700 hover:bg-slate-100"
            >
              Reminders ready: {remindersReadyCount}
            </Link>
          </div>
        </div>
        <Link href={`/${workspaceId}/actions`} className={primaryCtaClass}>
          Open Action Center →
        </Link>
      </div>
    </div>
  );
}
