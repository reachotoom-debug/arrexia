"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";
import { getWorkspaceNavItems } from "./nav";
import { formatPlanLabel, isUpgradeAvailable, type WorkspacePlan } from "@/lib/billing/plans";

interface SidebarProps {
  workspace: {
    id: string;
    name: string;
    website?: string | null;
  };
  user: {
    full_name?: string | null;
    email: string;
  };
  plan?: WorkspacePlan;
}

function getInitials(fullName: string | null | undefined, email: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return "U";
}

function getDisplayName(fullName: string | null | undefined, email: string): string {
  return fullName || email || "Account";
}

export function Sidebar({ workspace, user, plan = "free" }: SidebarProps) {
  const pathname = usePathname();
  const base = `/${workspace.id}`;
  const displayName = getDisplayName(user.full_name, user.email);
  const initials = getInitials(user.full_name, user.email);
  const navItems = getWorkspaceNavItems(workspace.id);

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* Arrexia Branding */}
      <div className="px-3 py-3 border-b border-slate-200">
        <Link href={`${base}/dashboard`} prefetch={false} className="flex items-center gap-3">
          <ArrexiaLogo variant="light" height={42} className="max-h-[42px] shrink-0 w-auto" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-slate-500 truncate">
              {workspace.name}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          
          return (
            <Link
              key={item.slug}
              href={item.href}
              prefetch={false}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Account Section at Bottom */}
      <div className="mt-auto border-t border-slate-200 p-3 space-y-3">
        {/* User Avatar & Info */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 truncate">
              {displayName}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {user.email}
            </div>
          </div>
        </div>

        {/* Plan & Upgrade */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-600">
            Plan:{" "}
            <span className="font-medium">{formatPlanLabel(plan)}</span>
          </span>
          {isUpgradeAvailable(plan) ? (
            <Link
              href={`${base}/settings?section=billing`}
              prefetch={false}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Upgrade
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
