import Link from "next/link";
import type { WorkspaceInfo } from "@/lib/auth/server";

interface SidebarBrandProps {
  workspace: WorkspaceInfo;
  workspaceId: string;
}

function SidebarBrand({ workspace, workspaceId }: SidebarBrandProps) {
  const websiteDisplay = workspace.website
    ? workspace.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;

  return (
    <Link
      href={`/${workspaceId}/dashboard`}
      className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
    >
      {workspace.logoUrl ? (
        <img
          src={workspace.logoUrl}
          alt={workspace.name}
          className="h-7 w-7 rounded-md object-cover border border-slate-200"
        />
      ) : (
        <div className="h-7 w-7 rounded-md bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
          {workspace.name?.substring(0, 2).toUpperCase() || "WS"}
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-slate-900 truncate">
          {workspace.name || "Workspace"}
        </span>
        {websiteDisplay && (
          <span className="text-[11px] text-slate-500 truncate">
            {websiteDisplay}
          </span>
        )}
      </div>
    </Link>
  );
}

export default SidebarBrand;

