import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";
import { trialHref } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";

type NavLink = {
  href: string;
  label: string;
  badge?: string;
};

const NAV_LINKS: NavLink[] = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tools", label: "Tools", badge: "New" },
  { href: "/blog", label: "Blog" },
  { href: "/#faq", label: "FAQ" },
];

const NAV_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-3.5">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-md leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <ArrexiaLogo
              variant="light"
              height={76}
              className="h-14 w-auto sm:h-[3.75rem] lg:h-16"
              priority
            />
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="min-h-11 px-4">
                Log in
              </Button>
            </Link>
            <Link href={trialHref("starter")}>
              <Button size="sm" className="min-h-11 px-4">
                Start free trial
              </Button>
            </Link>
          </div>
        </div>

        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 lg:flex-1 lg:gap-x-2"
        >
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={NAV_LINK_CLASS}>
              {link.label}
              {link.badge ? (
                <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {link.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login">
            <Button variant="ghost" className="min-h-11">
              Log in
            </Button>
          </Link>
          <Link href={trialHref("starter")}>
            <Button className="min-h-11">Start free trial</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
