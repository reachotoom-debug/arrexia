import React from "react";
import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react";

interface KPIProps {
  title?: string; // preferred going forward
  label?: string; // kept for backward compatibility if currently used
  value: React.ReactNode;
  description?: string;
  subtext?: string; // kept for backward compatibility
  trend?: string;
  trendLabel?: string;
  deltaLabel?: string; // kept for backward compatibility
  deltaDirection?: "up" | "down" | "flat";
  intent?: "default" | "danger" | "success" | "warning";
  icon?: LucideIcon;
  iconBgColor?: string;
}

function getValueColorClass(heading: string, intent?: "default" | "danger" | "success" | "warning"): string {
  if (intent === "danger") return "text-rose-700";
  if (intent === "success") return "text-emerald-700";
  if (intent === "warning") return "text-amber-700";
  
  // Fallback to label-based logic for backward compatibility
  const headingUpper = heading.toUpperCase();
  if (headingUpper.includes("TOTAL INVOICED")) return "text-blue-700";
  if (headingUpper.includes("TOTAL COLLECTED")) return "text-emerald-700";
  if (headingUpper.includes("TOTAL OUTSTANDING")) return "text-amber-700";
  if (headingUpper.includes("OVERDUE AMOUNT")) return "text-rose-700";
  if (headingUpper.includes("HIGH-RISK EXPOSURE") || headingUpper.includes("HIGH RISK")) return "text-red-700";
  if (headingUpper.includes("DSO")) return "text-indigo-700";
  return "text-slate-900";
}

export function KPI({
  title,
  label,
  value,
  description,
  subtext,
  trend,
  trendLabel,
  deltaLabel,
  deltaDirection,
  intent,
  icon: Icon,
  iconBgColor = "bg-slate-100",
}: KPIProps) {
  // Normalize heading: prefer title, fallback to label, then empty string
  const heading = title ?? label ?? "";
  
  // Normalize description/subtext: prefer description, fallback to subtext
  const displayDescription = description ?? subtext;
  
  // Normalize trend label: prefer trendLabel, fallback to trend, then deltaLabel
  const displayTrendLabel = trendLabel ?? trend ?? deltaLabel;
  
  // Normalize delta direction from trend if not explicitly provided
  const effectiveDeltaDirection = deltaDirection ?? (trend ? "up" : undefined);

  const DeltaIcon =
    effectiveDeltaDirection === "down"
      ? ArrowDownRight
      : effectiveDeltaDirection === "up"
      ? ArrowUpRight
      : null;

  const deltaColor =
    effectiveDeltaDirection === "down"
      ? "text-red-600"
      : effectiveDeltaDirection === "up"
      ? "text-emerald-600"
      : "text-slate-400";

  const valueColorClass = getValueColorClass(heading, intent);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header row: title + icon */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 leading-tight tracking-wide uppercase">
          {heading}
        </span>
        {Icon ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <div className="h-4 w-4 rounded-full bg-slate-300" />
          </div>
        )}
      </div>

      {/* Main value */}
      <p className={`mt-2 text-[22px] font-bold leading-tight ${valueColorClass}`}>
        {value}
      </p>

      {/* Bottom caption / helper text */}
      {displayDescription && (
        <p className="mt-1 text-[10px] text-slate-400">
          {displayDescription}
        </p>
      )}

      {/* Delta badge (if present) */}
      {DeltaIcon && displayTrendLabel && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${deltaColor}`}>
          <DeltaIcon className="h-3 w-3" />
          <span>{displayTrendLabel}</span>
        </div>
      )}
    </div>
  );
}
