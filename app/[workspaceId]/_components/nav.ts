import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Wallet,
  Bell,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  slug: string;
  label: string;
  href: string;
  icon?: LucideIcon;
};

/**
 * Get workspace navigation items in the canonical order.
 * Includes: dashboard, clients, invoices, payments, collections, reminders, settings
 */
export function getWorkspaceNavItems(workspaceId: string): NavItem[] {
  return [
    {
      slug: "dashboard",
      label: "Dashboard",
      href: `/${workspaceId}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      slug: "clients",
      label: "Clients",
      href: `/${workspaceId}/clients`,
      icon: Users,
    },
    {
      slug: "invoices",
      label: "Invoices",
      href: `/${workspaceId}/invoices`,
      icon: FileText,
    },
    {
      slug: "payments",
      label: "Payments",
      href: `/${workspaceId}/payments`,
      icon: CreditCard,
    },
    {
      slug: "collections",
      label: "Collections",
      href: `/${workspaceId}/collections`,
      icon: Wallet,
    },
    {
      slug: "reminders",
      label: "Reminders",
      href: `/${workspaceId}/reminders`,
      icon: Bell,
    },
    {
      slug: "settings",
      label: "Settings",
      href: `/${workspaceId}/settings`,
      icon: SettingsIcon,
    },
  ];
}

