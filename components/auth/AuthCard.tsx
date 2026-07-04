import type { ReactNode } from "react";

export const authCardShellClass = "mx-auto w-full max-w-[450px]";

export const authCardClass =
  "w-full rounded-3xl border border-slate-200/60 bg-white p-9 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)] sm:p-11";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className={authCardShellClass}>
      <div className={authCardClass}>{children}</div>
    </div>
  );
}
