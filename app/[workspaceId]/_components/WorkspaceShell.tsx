"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Shield } from "lucide-react";
import { DEFAULT_AVATAR_URL } from "@/lib/constants";
import { formatPlanLabel, isUpgradeAvailable, type WorkspacePlan } from "@/lib/billing/plans";
import { getWorkspaceNavItems } from "./nav";
import {
  PageContainer,
  type PageContainerVariant,
} from "@/components/layout/PageContainer";

function getPageContainerVariant(pathname: string | null): PageContainerVariant {
  if (!pathname) return "default";
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return "default";

  const section = parts[1];
  const third = parts[2];

  if (section === "settings") {
    if (third === "import" || third === "health") return "tables";
    return "narrow";
  }

  const tableListSections = [
    "clients",
    "invoices",
    "payments",
    "collections",
    "reminders",
    "dashboard",
  ];
  if (tableListSections.includes(section) && parts.length === 2) {
    return "tables";
  }

  if (
    parts.length >= 3 &&
    ["clients", "invoices", "payments", "collections"].includes(section)
  ) {
    return "narrow";
  }

  return "default";
}

type SidebarVariant = "drawer" | "rail";

type WorkspaceSidebarPanelProps = {
  workspaceId: string;
  workspaceName: string;
  userEmail: string;
  userFullName: string | null;
  userAvatarUrl: string | null;
  plan: WorkspacePlan;
  showAdminLink: boolean;
  adminPath?: string;
  pathname: string | null;
  onNavigate?: () => void;
  variant: SidebarVariant;
};

function WorkspaceSidebarPanel({
  workspaceId,
  workspaceName,
  userEmail,
  userFullName,
  userAvatarUrl,
  plan,
  showAdminLink,
  adminPath = "/admin",
  pathname,
  onNavigate,
  variant,
}: WorkspaceSidebarPanelProps) {
  const items = getWorkspaceNavItems(workspaceId);
  const displayName = userFullName || userEmail || "Account";
  const afterNav = () => onNavigate?.();
  const rail = variant === "rail";

  return (
    <>
      <div
        className={
          rail
            ? "flex shrink-0 items-center justify-center gap-0 px-2 pb-2.5 pt-3 lg:justify-start lg:gap-3 lg:px-4"
            : "flex shrink-0 items-center gap-3 px-4 pb-2.5 pt-3"
        }
      >
        <Image
          src="/brand/icon-logo.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
        <div className="hidden min-w-0 flex-col lg:flex">
          <span className="text-sm font-semibold text-slate-900">
            FlowCollect
          </span>
          <span className="truncate text-xs text-slate-500">
            {workspaceName}
          </span>
        </div>
      </div>

      <div className="mx-3 mb-2 shrink-0 border-t border-slate-200 lg:mx-3" />

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 pt-1 lg:px-2">
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={afterNav}
                className={[
                  "group flex items-center rounded-lg py-2 text-sm transition-colors",
                  rail
                    ? "justify-center gap-0 px-2 lg:justify-start lg:gap-3 lg:px-3"
                    : "gap-3 px-3",
                  isActive
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                {Icon && (
                  <Icon
                    className={
                      "h-4 w-4 shrink-0 " +
                      (isActive
                        ? "text-blue-600"
                        : "text-slate-400 group-hover:text-slate-700")
                    }
                  />
                )}
                <span className={rail ? "hidden truncate lg:inline" : "truncate"}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {showAdminLink ? (
            <Link
              href={adminPath}
              title="Admin"
              onClick={afterNav}
              className={[
                "group flex items-center rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                rail
                  ? "justify-center gap-0 px-2 lg:justify-start lg:gap-3 lg:px-3"
                  : "gap-3 px-3",
              ].join(" ")}
            >
              <Shield className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
              <span className={rail ? "hidden truncate lg:inline" : "truncate"}>Admin</span>
              <span
                className={
                  rail
                    ? "hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:inline"
                    : "rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                }
              >
                Internal
              </span>
            </Link>
          ) : null}
          <Link
            href="/logout"
            title="Logout"
            onClick={afterNav}
            className={[
              "group flex items-center rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              rail
                ? "justify-center gap-0 px-2 lg:justify-start lg:gap-3 lg:px-3"
                : "gap-3 px-3",
            ].join(" ")}
          >
            <LogOut className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
            <span className={rail ? "hidden truncate lg:inline" : "truncate"}>
              Logout
            </span>
          </Link>
        </nav>
      </div>

      <div
        className={
          rail
            ? "mt-auto shrink-0 border-t border-slate-200 px-1 py-2.5 lg:px-3"
            : "mt-auto shrink-0 border-t border-slate-200 px-3 py-2.5"
        }
      >
        <div
          className={
            rail
              ? "flex items-center justify-center lg:justify-start lg:gap-3"
              : "flex items-center gap-3"
          }
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-semibold uppercase text-white">
            <img
              src={userAvatarUrl || DEFAULT_AVATAR_URL}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="hidden min-w-0 flex-col lg:flex">
            <span className="truncate text-sm font-medium text-slate-900">
              {displayName}
            </span>
            <span className="truncate text-xs text-slate-500">{userEmail}</span>
          </div>
        </div>

        <div className="mt-2 hidden items-center justify-between text-xs lg:flex">
          <span className="text-slate-500">
            Plan: <span className="font-medium text-slate-700">{formatPlanLabel(plan)}</span>
          </span>
          {isUpgradeAvailable(plan) ? (
            <Link
              href={`/${workspaceId}/settings?section=billing`}
              onClick={afterNav}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Upgrade
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

interface WorkspaceShellProps {
  workspaceId: string;
  workspaceName: string;
  userEmail: string;
  userFullName: string | null;
  userAvatarUrl: string | null;
  plan: WorkspacePlan;
  showAdminLink: boolean;
  adminPath?: string;
  children: React.ReactNode;
}

export function WorkspaceShell({
  workspaceId,
  workspaceName,
  userEmail,
  userFullName,
  userAvatarUrl,
  plan,
  showAdminLink,
  adminPath = "/admin",
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sidebarProps: Omit<WorkspaceSidebarPanelProps, "variant"> = {
    workspaceId,
    workspaceName,
    userEmail,
    userFullName,
    userAvatarUrl,
    plan,
    showAdminLink,
    adminPath,
    pathname,
  };

  return (
    <div className="flex h-screen min-h-0 w-full min-w-0 flex-col overflow-x-hidden lg:flex-row">
      {/* Tablet (768–1023): icon rail; Desktop (≥1024): full sidebar */}
      <aside className="relative z-0 hidden h-screen min-h-0 w-[4.25rem] shrink-0 flex-col overflow-hidden border-r bg-white md:flex lg:w-56">
        <WorkspaceSidebarPanel {...sidebarProps} variant="rail" />
      </aside>

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            className="-ml-1 rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>
          <span className="text-sm font-semibold text-slate-900">
            FlowCollect
          </span>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-slate-50">
          <PageContainer variant={getPageContainerVariant(pathname)}>
            {children}
          </PageContainer>
        </main>
      </div>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex h-screen min-h-0 w-56 flex-col overflow-x-hidden border-r bg-white transition-transform duration-200 ease-out md:hidden",
          mobileNavOpen
            ? "translate-x-0"
            : "-translate-x-full pointer-events-none",
        ].join(" ")}
        aria-hidden={!mobileNavOpen}
      >
        <WorkspaceSidebarPanel
          {...sidebarProps}
          variant="drawer"
          onNavigate={() => setMobileNavOpen(false)}
        />
      </aside>
    </div>
  );
}
