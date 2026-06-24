"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminBrandMark } from "./AdminBrandMark";

const NAV_SUFFIXES = [
  { href: "", label: "Overview", exact: true },
  { href: "/users", label: "Users" },
  { href: "/subscribers", label: "Subscribers" },
  { href: "/revenue", label: "Revenue" },
  { href: "/renewals", label: "Renewals" },
  { href: "/email-ops", label: "Email Ops" },
  { href: "/product-usage", label: "Product Usage" },
  { href: "/notifications", label: "Notifications" },
  { href: "/security", label: "Security" },
  { href: "/settings", label: "Settings" },
] as const;

type AdminSidebarProps = {
  adminBasePath: string;
  backToAppHref: string;
};

export function AdminSidebar({ adminBasePath, backToAppHref }: AdminSidebarProps) {
  const pathname = usePathname();
  const navItems = NAV_SUFFIXES.map((item) => ({
    ...item,
    href: item.href ? `${adminBasePath}${item.href}` : adminBasePath,
  }));

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
      <div className="border-b border-slate-800 px-5 py-6">
        <AdminBrandMark variant="dark" adminBasePath={adminBasePath} />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active =
            "exact" in item && item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-800 px-3 py-4">
        <Link
          href={backToAppHref}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to App
        </Link>
        <p className="px-3 text-xs text-slate-500">SaaS metrics only · No customer AR</p>
      </div>
    </aside>
  );
}
