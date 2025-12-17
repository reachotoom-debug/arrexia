"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export interface SidebarProps {
  workspaceId: string;
  user: {
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  };
}

const navItems = [
  { label: "Dashboard", segment: "dashboard" },
  { label: "Clients", segment: "clients" },
  { label: "Invoices", segment: "invoices" },
  { label: "Collections", segment: "collections" },
  { label: "Payments", segment: "payments" },
  { label: "Reminders", segment: "reminders" },
  { label: "Settings", segment: "settings" },
];

function getInitials(name: string | null, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? "U";
}

export function Sidebar({ workspaceId, user }: SidebarProps) {
  const pathname = usePathname();
  const base = `/${workspaceId}`;

  const fullNav = navItems.map((item) => ({
    ...item,
    href: `${base}/${item.segment}`,
  }));

  const initials = getInitials(user.name, user.email);

  return (
    <aside className="flex h-screen w-72 flex-col bg-slate-50">
      {/* Brand / Logo */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
          FC
        </div>
        <div className="text-lg font-semibold text-gray-900">FlowCollect</div>
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex-1 overflow-y-auto px-3 space-y-1">
        {fullNav.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md px-4 py-2 text-sm transition-colors",
                "text-gray-700 hover:bg-blue-50 hover:text-blue-600",
                isActive && "bg-blue-50 text-blue-600 font-semibold"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Account Block */}
      <div className="mt-auto border-t border-slate-200 px-4 py-4">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name ?? user.email}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {initials}
            </div>
          )}

          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">
              {user.name && user.name.trim().length > 0
                ? user.name
                : user.email}
            </div>
            {user.name && (
              <div className="truncate text-xs text-gray-500">
                {user.email}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Plan: Free</span>
          <Link
            href={`/pricing?workspaceId=${workspaceId}`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Upgrade
          </Link>
        </div>
        <div className="mt-2">
          <Link
            href="/logout"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Link>
        </div>
      </div>
    </aside>
  );
}
