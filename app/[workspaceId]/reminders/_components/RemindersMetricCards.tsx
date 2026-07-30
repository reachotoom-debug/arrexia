type RemindersMetricCard = {
  label: string;
  value: string;
  detail?: string;
};

type RemindersMetricCardsProps = {
  metrics: RemindersMetricCard[];
  ariaLabel: string;
};

export function RemindersMetricCards({ metrics, ariaLabel }: RemindersMetricCardsProps) {
  return (
    <section aria-label={ariaLabel} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {metric.label}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">
            {metric.value}
          </p>
          {metric.detail ? (
            <p className="mt-1 text-xs leading-snug text-slate-500">{metric.detail}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
