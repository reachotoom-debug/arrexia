"use client";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentDirection: "asc" | "desc" | null;
  onSort: (key: string) => void;
}

export default function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
}: SortableHeaderProps) {
  const isActive = currentSort === sortKey;
  const isAsc = isActive && currentDirection === "asc";

  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
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

