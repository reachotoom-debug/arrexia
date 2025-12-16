"use client";
import { clsx } from "clsx";

interface InvoiceSortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentDirection: "asc" | "desc" | null;
  onSort: (key: string) => void;
  className?: string;
}

export default function InvoiceSortableHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
  className,
}: InvoiceSortableHeaderProps) {
  const isActive = currentSort === sortKey;
  const isAsc = isActive && currentDirection === "asc";

  return (
    <th
      className={clsx(
        "py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
        className ?? "px-6"
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <div className="flex flex-col">
          <span
            className={`text-[8px] leading-none ${
              isActive && isAsc ? "text-slate-900" : "text-slate-400"
            }`}
          >
            ▲
          </span>
          <span
            className={`text-[8px] leading-none ${
              isActive && !isAsc ? "text-slate-900" : "text-slate-400"
            }`}
          >
            ▼
          </span>
        </div>
      </div>
    </th>
  );
}

