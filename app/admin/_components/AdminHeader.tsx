import Link from "next/link";
import { AdminBrandMark } from "./AdminBrandMark";

const MOBILE_NAV_SUFFIXES = [
  { href: "", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/subscribers", label: "Subscribers" },
  { href: "/revenue", label: "Revenue" },
  { href: "/renewals", label: "Renewals" },
  { href: "/email-ops", label: "Email Ops" },
  { href: "/notifications", label: "Alerts" },
  { href: "/security", label: "Security" },
] as const;

type AdminHeaderProps = {
  title: string;
  description?: string;
  adminEmail: string | null;
  adminRole: string | null;
  bootstrapAllowed?: boolean;
  adminBasePath: string;
  backToAppHref: string;
};

export function AdminHeader({
  title,
  description,
  adminEmail,
  adminRole,
  bootstrapAllowed = false,
  adminBasePath,
  backToAppHref,
}: AdminHeaderProps) {
  const navItems = MOBILE_NAV_SUFFIXES.map((item) => ({
    ...item,
    href: item.href ? `${adminBasePath}${item.href}` : adminBasePath,
  }));

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4 lg:hidden">
        <AdminBrandMark variant="light" adminBasePath={adminBasePath} />
        <Link
          href={backToAppHref}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Back to App
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bootstrapAllowed ? (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Bootstrap required
            </span>
          ) : null}
          {adminRole ? (
            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold capitalize text-indigo-800">
              {adminRole.replace("_", " ")}
            </span>
          ) : null}
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {adminEmail ?? "admin"}
          </span>
        </div>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
