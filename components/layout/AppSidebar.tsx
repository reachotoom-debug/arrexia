"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderKanban,
  CreditCard,
  Bell,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { DEFAULT_AVATAR_URL } from "@/lib/constants";

type AppSidebarProps = {
  workspaceId: string;
  workspaceName: string;
  userEmail: string;
  userInitials: string;
  planLabel?: string; // e.g. "Free", "Starter", etc.
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

const navItems = (workspaceId: string) => [
  {
    label: "Dashboard",
    href: `/${workspaceId}/dashboard`,
    icon: LayoutDashboard,
  },
  {
    label: "Clients",
    href: `/${workspaceId}/clients`,
    icon: Users,
  },
  {
    label: "Invoices",
    href: `/${workspaceId}/invoices`,
    icon: FileText,
  },
  {
    label: "Collections",
    href: `/${workspaceId}/collections`,
    icon: FolderKanban,
  },
  {
    label: "Payments",
    href: `/${workspaceId}/payments`,
    icon: CreditCard,
  },
  {
    label: "Reminders",
    href: `/${workspaceId}/reminders`,
    icon: Bell,
  },
  {
    label: "Settings",
    href: `/${workspaceId}/settings`,
    icon: SettingsIcon,
  },
];

export function AppSidebar({
  workspaceId,
  workspaceName,
  userEmail,
  userInitials,
  planLabel = "Free",
  profile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const items = navItems(workspaceId);

  return (
    <aside className="w-56 shrink-0 border-r bg-white">
      <div className="flex h-screen flex-col">
        {/* Top: App logo */}
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white">
            FC
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">
              FlowCollect
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="mx-3 mb-2 border-t border-slate-200" />

        {/* Main nav */}
        <div className="flex-1 px-2 pb-2 pt-1">
          <nav className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname?.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                >
                  <Icon
                    className={
                      "h-4 w-4 " +
                      (isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-700")
                    }
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
            <Link
              href="/logout"
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4 text-slate-400 group-hover:text-slate-700" />
              <span className="truncate">Logout</span>
            </Link>
          </nav>
        </div>

        {/* Separator above account block */}
        <div className="mx-4 border-t border-slate-200" />

        {/* Bottom: account + plan */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold uppercase text-white overflow-hidden">
              <img
                src={profile?.avatar_url || DEFAULT_AVATAR_URL}
                alt={profile?.full_name || userEmail || "Avatar"}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-medium text-slate-900">
                {profile?.full_name || workspaceName || "Account"}
              </span>
              <span className="truncate text-xs text-slate-500">
                {userEmail}
              </span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">Plan: {planLabel}</span>
            <Link
              href={`/pricing?workspaceId=${workspaceId}`}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Upgrade
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
