import Link from "next/link";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  workspaceId: string;
  currentParams?: Record<string, string | string[] | undefined>; // Made optional
  basePath?: string; // e.g. "/{workspaceId}/invoices" or "/{workspaceId}/clients"
  align?: "left" | "right" | "center";
}

export function SortableHeader({
  label,
  sortKey,
  workspaceId,
  currentParams = {}, // Default to empty object to prevent runtime crash
  basePath, // Optional - will be inferred if not provided
  align = "left",
}: SortableHeaderProps) {
  // Defensive: ensure currentParams is always an object
  const safeParams = currentParams || {};
  
  // Extract current sort and dir from params (safe with default {})
  const currentSort = safeParams.sort 
    ? (Array.isArray(safeParams.sort) ? safeParams.sort[0] : safeParams.sort)
    : undefined;
  const currentDir = safeParams.dir
    ? (Array.isArray(safeParams.dir) ? safeParams.dir[0] : safeParams.dir) as "asc" | "desc" | undefined
    : undefined;
  
  const isActive = currentSort === sortKey;
  const nextDir = !isActive ? "asc" : currentDir === "asc" ? "desc" : "asc";
  
  const icon = !isActive 
    ? "↕" 
    : currentDir === "asc" 
    ? "↑" 
    : "↓";

  // Build URL preserving all current params and updating sort/dir
  const params = new URLSearchParams();
  
  // Preserve all meaningful params (safe iteration with safeParams)
  // Use "q" for search (consistent with invoices), but also support "search" for backward compatibility
  const meaningfulParams = ["status", "q", "search", "clientId", "pageSize"];
  meaningfulParams.forEach((key) => {
    const value = safeParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        // Normalize "search" to "q" for consistency
        const paramKey = key === "search" ? "q" : key;
        params.set(paramKey, strValue);
      }
    }
  });
  
  // When clicking a header: force view="default" and set sort/dir
  // This makes header sorting mutually exclusive with view presets
  params.set("view", "default");
  params.set("sort", sortKey);
  params.set("dir", nextDir);
  
  // Determine base path - use provided basePath or infer from workspaceId
  const resolvedBasePath = basePath || `/${workspaceId}/invoices`;
  
  // Remove default sort/dir combinations from URL
  // For invoices: issue_date desc is default
  if (resolvedBasePath.includes("/invoices") && sortKey === "issue_date" && nextDir === "desc") {
    params.delete("sort");
    params.delete("dir");
  }
  // For clients: no default sort (sort is null by default), so we keep sort/dir when set
  
  // Remove default status/view if present
  if (params.get("status") === "all") {
    params.delete("status");
  }
  // For clients, we always set view="default" when clicking header
  // Keep it in URL for canonical structure (redirect will ensure it's always present)
  // But for cleaner URLs in UI navigation, we can remove it if it's the default
  // Actually, keep it for now to maintain canonical structure
  // For invoices, remove default view
  if (resolvedBasePath.includes("/invoices") && params.get("view") === "default") {
    params.delete("view");
  }
  
  // Remove default dir when no sort
  if (resolvedBasePath.includes("/invoices") && params.get("dir") === "desc" && !params.get("sort")) {
    params.delete("dir");
  }
  // For clients, dir="desc" is default, so remove it if no sort
  if (resolvedBasePath.includes("/clients") && params.get("dir") === "desc" && !params.get("sort")) {
    params.delete("dir");
  }
  
  // Always reset page to 1 when sorting
  params.delete("page");
  
  const queryString = params.toString();
  const href = `${resolvedBasePath}${queryString ? `?${queryString}` : ""}`;
  
  const baseClass =
    "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors";
  const colorClass = isActive ? "text-slate-900" : "text-gray-600 hover:text-slate-900";
  const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  
  return (
    <Link
      href={href}
      className={`${baseClass} ${colorClass} ${justifyClass} ${
        isActive ? "rounded-md bg-slate-100 px-1.5 py-0.5" : ""
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px]">{icon}</span>
    </Link>
  );
}

