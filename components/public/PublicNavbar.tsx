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

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-3.5">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex shrink-0 items-center leading-none">
            <ArrexiaLogo
              variant="light"
              height={76}
              className="h-14 w-auto sm:h-[3.75rem] lg:h-16"
              priority
            />
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href={trialHref("starter")}>
              <Button size="sm">Start free trial</Button>
            </Link>
          </div>
        </div>

        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-slate-600 lg:flex-1 lg:gap-x-6"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900"
            >
              {link.label}
              {link.badge ? (
                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {link.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link href={trialHref("starter")}>
            <Button>Start free trial</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
