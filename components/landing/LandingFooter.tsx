import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tools", label: "Tools" },
  { href: "/blog", label: "Blog" },
] as const;

const RESOURCE_LINKS = [
  { href: "/about", label: "About" },
  { href: "/tools", label: "Free Tools" },
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

const FOOTER_LINK_CLASS =
  "inline-flex min-h-11 items-center py-1 text-sm text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white py-14 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:gap-12">
        <div className="self-start sm:col-span-2 lg:col-span-1">
          <div className="flex w-full max-w-xs flex-col items-center text-center sm:items-start sm:text-left">
            <Link
              href="/"
              className="-mb-1.5 block shrink-0 rounded-md leading-[0] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <ArrexiaLogo
                variant="light"
                height={64}
                className="block h-14 w-auto sm:h-16"
              />
            </Link>
            <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
              Cash Flow. Clarity. Confidence.
            </p>
            <a
              href="https://arrexia.app"
              className={`mt-3 ${FOOTER_LINK_CLASS} text-slate-600`}
            >
              arrexia.app
            </a>
            <p className="mt-3 text-xs font-normal leading-snug text-slate-500">
              Built for growing businesses.
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Product</p>
          <ul className="mt-3 space-y-1">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={FOOTER_LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Resources</p>
          <ul className="mt-3 space-y-1">
            {RESOURCE_LINKS.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={FOOTER_LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Social</p>
          <ul className="mt-3 space-y-1">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={FOOTER_LINK_CLASS}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-slate-200 px-4 pt-6 sm:px-6">
        <p className="text-center text-sm text-slate-600">
          © {currentYear} Arrexia. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
