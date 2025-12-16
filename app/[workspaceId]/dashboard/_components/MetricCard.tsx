import type { LucideIcon } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { DeltaBadge } from "./DeltaBadge";

interface MetricCardProps {
  label: string;
  period: string;
  value: string | number;
  valueColor: string;
  delta?: number;
  deltaInverse?: boolean;
  bottomLabel: string;
  bottomNote?: string;
  icon: LucideIcon;
  trend?: number[];
  sparklineColors?: {
    stroke: string;
    fill: string;
  };
}

export function MetricCard({
  label,
  period,
  value,
  valueColor,
  delta,
  deltaInverse = false,
  bottomLabel,
  bottomNote,
  icon: Icon,
  trend,
  sparklineColors,
}: MetricCardProps) {
  return (
    <div className="relative flex min-h-[120px] flex-col rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
      {/* Header row: label + period (left) + icon (right) */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-600 truncate">{label}</div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{period}</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {/* Main value */}
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </div>

      {/* Delta badge */}
      {delta !== undefined && (
        <div className="flex items-baseline gap-2 flex-wrap mt-1">
          <DeltaBadge value={delta} inverse={deltaInverse} />
        </div>
      )}

      {/* Bottom line: bottomLabel (left) + bottomNote (right) */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span className="truncate flex-1 min-w-0 pr-2">{bottomLabel}</span>
        {bottomNote && (
          <span className="text-slate-400 flex-shrink-0">{bottomNote}</span>
        )}
      </div>

      {/* Sparkline at bottom right */}
      {trend && sparklineColors && (
        <div className="absolute bottom-3 right-3 w-14 h-6 opacity-60">
          <Sparkline data={trend} colorClasses={sparklineColors} width={56} height={24} />
        </div>
      )}
    </div>
  );
}
