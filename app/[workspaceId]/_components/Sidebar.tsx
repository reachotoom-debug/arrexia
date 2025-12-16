"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  plan?: "free" | "pro" | "trial";
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

const navItems = [
  { slug: "dashboard", label: "Dashboard" },
  { slug: "clients", label: "Clients" },
  { slug: "invoices", label: "Invoices" },
  { slug: "collections", label: "Collections" },
  { slug: "payments", label: "Payments" },
  { slug: "reminders", label: "Reminders" },
  { slug: "settings", label: "Settings" },
];

export function Sidebar({ workspace, user, plan = "free" }: SidebarProps) {
  const pathname = usePathname();
  const base = `/${workspace.id}`;
  const displayName = getDisplayName(user.full_name, user.email);
  const initials = getInitials(user.full_name, user.email);

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* FlowCollect Branding */}
      <div className="px-4 py-4 border-b border-slate-200">
        <Link href={`${base}/dashboard`} className="flex items-center gap-3">
          {/* Logo - try to use FC-logo.png, fallback to colored square */}
          <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            FC
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base font-semibold tracking-tight text-slate-900">
              FlowCollect
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              {workspace.name}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const href = `${base}/${item.slug}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          
          return (
            <Link
              key={item.slug}
              href={href}
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
      <div className="mt-auto border-t border-slate-200 p-4 space-y-3">
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
            Plan: <span className="font-medium capitalize">{plan}</span>
          </span>
          {plan !== "pro" && (
            <Link
              href={`${base}/settings/billing`}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
