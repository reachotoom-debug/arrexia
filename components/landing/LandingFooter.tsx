import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
] as const;

const RESOURCE_LINKS = [
  { href: "/about", label: "About" },
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/contact", label: "Contact" },
] as const;

const SOCIAL_LINKS = [
  {
    href: "https://www.linkedin.com/in/mohammed-otoom-84501561",
    label: "LinkedIn",
  },
  {
    href: "https://x.com/Otoomai",
    label: "X",
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="md:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex shrink-0 transition-opacity hover:opacity-90">
            <ArrexiaLogo variant="light" height={48} className="h-11 w-auto sm:h-12" />
          </Link>
          <p className="mt-3 text-sm font-medium text-blue-600">Cash Flow. Clarity. Confidence.</p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm text-slate-500 transition-colors hover:text-blue-600"
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
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resources</p>
          <ul className="mt-4 space-y-2">
            {RESOURCE_LINKS.map((link) => (
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
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Social</p>
          <ul className="mt-4 space-y-2">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-600 transition-colors hover:text-slate-900"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-7xl border-t border-slate-200 px-4 pt-6 sm:px-6">
        <p className="text-center text-sm text-slate-500">© 2026 Arrexia. All rights reserved.</p>
      </div>
    </footer>
  );
}
