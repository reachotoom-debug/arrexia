import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface DeltaBadgeProps {
  value: number;
  inverse?: boolean;
}

export function DeltaBadge({ value, inverse = false }: DeltaBadgeProps) {
  const rounded = Math.round(value * 10) / 10;
  const displayValue = rounded > 0 ? `+${rounded.toFixed(1)}%` : `${rounded.toFixed(1)}%`;

  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
        {displayValue}
      </span>
    );
  }

  const isPositive = rounded > 0;
  const isGood = inverse ? !isPositive : isPositive;

  const bgColor = isGood ? "bg-emerald-50" : "bg-red-50";
  const textColor = isGood ? "text-emerald-700" : "text-red-700";
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${bgColor} px-2 py-0.5 text-[10px] font-medium ${textColor}`}>
      <Icon className="h-2.5 w-2.5" />
      {displayValue}
    </span>
  );
}
