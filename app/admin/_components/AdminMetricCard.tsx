type AdminMetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  variant?: "primary" | "secondary";
  accent?: "indigo" | "emerald" | "amber" | "slate";
};

const ACCENT_STYLES = {
  indigo: "border-indigo-100 bg-gradient-to-br from-indigo-50 to-white",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white",
  amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-white",
  slate: "border-slate-200 bg-white",
} as const;

export function AdminMetricCard({
  label,
  value,
  hint,
  variant = "secondary",
  accent = "slate",
}: AdminMetricCardProps) {
  const isPrimary = variant === "primary";

  return (
    <div
      className={`rounded-xl border shadow-sm ${ACCENT_STYLES[accent]} ${
        isPrimary ? "p-6" : "p-4"
      }`}
    >
      <p
        className={`font-semibold uppercase tracking-wide text-slate-500 ${
          isPrimary ? "text-xs" : "text-[11px]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 font-semibold tracking-tight text-slate-900 ${
          isPrimary ? "text-3xl" : "text-xl"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
