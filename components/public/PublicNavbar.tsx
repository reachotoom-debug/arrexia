import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";
import { trialHref } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
] as const;

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
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600 lg:flex-1"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-slate-900"
            >
              {link.label}
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
