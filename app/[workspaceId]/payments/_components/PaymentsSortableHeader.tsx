"use client";

import Link from "next/link";

interface PaymentsSortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortBy?: string;
  currentSortDir?: string;
  hrefBase: string;
  searchParams: Record<string, string | string[] | undefined>;
  align?: "left" | "right";
}

export function PaymentsSortableHeader({
  label,
  sortKey,
  currentSortBy,
  currentSortDir,
  hrefBase,
  searchParams,
  align = "left",
}: PaymentsSortableHeaderProps) {
  const isActive = currentSortBy === sortKey;
  const nextDir = !isActive ? "asc" : currentSortDir === "asc" ? "desc" : "asc";
  
  const icon = !isActive 
    ? "↕" 
    : currentSortDir === "asc" 
    ? "↑" 
    : "↓";

  // Build URL with all existing params
  const params = new URLSearchParams();
  
  // Preserve existing params
  Object.entries(searchParams).forEach(([key, value]) => {
    if (key === "sort" || key === "direction") return; // Will set these below
    if (value && value !== "" && value !== "all") {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else {
        params.set(key, value);
      }
    }
  });
  
  // Set sort params
  params.set("sort", sortKey);
  params.set("direction", nextDir);
  params.set("page", "1"); // Reset to first page on sort change
  
  const queryString = params.toString();
  const href = queryString ? `${hrefBase}?${queryString}` : hrefBase;
  
  const baseClass = "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors";
  const colorClass = isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900";
  const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  
  return (
    <Link
      href={href}
      className={`${baseClass} ${colorClass} ${justifyClass}`}
    >
      <span>{label}</span>
      <span className="text-[10px]">{icon}</span>
    </Link>
  );
}

