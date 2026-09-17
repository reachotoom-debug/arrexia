import {
  FileText,
  Send,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type RemindersMetricCard = {
  label: string;
  value: string;
  detail?: string;
};

type RemindersMetricCardsProps = {
  metrics: RemindersMetricCard[];
  ariaLabel: string;
  helperText?: string;
};

type MetricVisual = {
  icon: LucideIcon;
  iconClassName: string;
  iconBackgroundClassName: string;
  valueClassName?: string;
};

const metricVisuals: Record<string, MetricVisual> = {
  "Ready to Send Today": {
    icon: Send,
    iconClassName: "text-blue-600",
    iconBackgroundClassName: "bg-blue-50",
  },
  "Eligible Outstanding Today": {
    icon: WalletCards,
    iconClassName: "text-rose-600",
    iconBackgroundClassName: "bg-rose-50",
    valueClassName: "text-rose-600",
  },
  "Customers Today": {
    icon: Users,
    iconClassName: "text-violet-600",
    iconBackgroundClassName: "bg-violet-50",
  },
  "Rules Due Today": {
    icon: FileText,
    iconClassName: "text-amber-600",
    iconBackgroundClassName: "bg-amber-50",
  },
};

export function RemindersMetricCards({
  metrics,
  ariaLabel,
  helperText,
}: RemindersMetricCardsProps) {
  return (
    <section aria-label={ariaLabel} className="space-y-2">
      {helperText ? (
        <p className="text-xs leading-snug text-slate-500">{helperText}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => {
          const visual = metricVisuals[metric.label] ?? metricVisuals["Ready to Send Today"];
          const Icon = visual.icon;

          return (
            <div
              key={metric.label}
              className="flex min-h-[110px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${visual.iconBackgroundClassName}`}
                aria-hidden="true"
              >
                <Icon className={`h-6 w-6 ${visual.iconClassName}`} strokeWidth={2} />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-600">
                  {metric.label}
                </p>

                <p
                  className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${
                    visual.valueClassName ?? "text-slate-900"
                  }`}
                >
                  {metric.value}
                </p>

                {metric.detail ? (
                  <p className="mt-1 text-xs leading-snug text-slate-500">
                    {metric.detail}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
