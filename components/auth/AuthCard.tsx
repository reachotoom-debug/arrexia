import type { ReactNode } from "react";

export const authCardShellClass = "mx-auto w-full max-w-md";

export const authCardClass =
  "w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className={authCardShellClass}>
      <div className={authCardClass}>{children}</div>
    </div>
  );
}
