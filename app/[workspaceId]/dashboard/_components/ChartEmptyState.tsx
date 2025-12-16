import Link from "next/link";
import { LineChart } from "lucide-react";

export type ChartEmptyStateProps = {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  icon?: React.ReactNode;
};

export function ChartEmptyState({
  title,
  description,
  href,
  actionLabel,
  icon,
}: ChartEmptyStateProps) {
  const IconComponent = icon || <LineChart className="h-5 w-5" />;

  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 py-8 text-center text-slate-500">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400">
        {typeof icon === "string" ? (
          <span className="text-2xl">{icon}</span>
        ) : (
          IconComponent
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-slate-500">{description}</p>
      </div>
      {href && actionLabel && (
        <Link
          href={href}
          className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
