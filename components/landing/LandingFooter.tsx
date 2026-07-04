import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
] as const;

const COMPANY_LINKS = [
  { href: "#", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

const LEGAL_LINKS = [
  { href: "#", label: "Privacy" },
  { href: "#", label: "Terms" },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="inline-flex shrink-0 transition-opacity hover:opacity-90">
            <ArrexiaLogo variant="light" height={48} className="h-10 w-auto md:h-12" />
          </Link>
          <p className="mt-3 text-sm font-medium text-blue-600">Cash Solved.</p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm text-slate-500 transition-colors hover:text-blue-600"
          >
            arrexia.app
          </Link>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Product</p>
          <ul className="mt-4 space-y-2">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company</p>
          <ul className="mt-4 space-y-2">
            {COMPANY_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Legal</p>
          <ul className="mt-4 space-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-7xl border-t border-slate-200 px-4 pt-6 sm:px-6">
        <p className="text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Arrexia. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
