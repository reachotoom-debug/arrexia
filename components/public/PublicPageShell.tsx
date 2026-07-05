import type { ReactNode } from "react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PublicNavbar } from "@/components/public/PublicNavbar";

type PublicPageShellProps = {
  children: ReactNode;
  className?: string;
};

export function PublicPageShell({ children, className = "" }: PublicPageShellProps) {
  return (
    <div className={`min-h-screen bg-white text-slate-900 ${className}`.trim()}>
      <PublicNavbar />
      {children}
      <LandingFooter />
    </div>
  );
}
