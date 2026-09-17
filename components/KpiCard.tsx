import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  valueTitle?: string;
  supportingText: string;
  icon: LucideIcon;
  iconClassName: string;
  iconContainerClassName: string;
}

export function KpiCard({
  label,
  value,
  valueTitle,
  supportingText,
  icon: Icon,
  iconClassName,
  iconContainerClassName,
}: KpiCardProps) {
  return (
    <div className="flex h-[7.5rem] min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 shadow-sm">
      <div
        className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ${iconContainerClassName}`}
        aria-hidden="true"
      >
        <Icon className={`h-6 w-6 ${iconClassName}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <p title={valueTitle} className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
        <p className="text-xs text-slate-500">{supportingText}</p>
      </div>
    </div>
  );
}
