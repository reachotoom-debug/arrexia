import Link from "next/link";
import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";

type AdminBrandMarkProps = {
  variant?: "dark" | "light";
  adminBasePath?: string;
};

export function AdminBrandMark({
  variant = "dark",
  adminBasePath = "/admin",
}: AdminBrandMarkProps) {
  const isDark = variant === "dark";

  return (
    <Link
      href={adminBasePath}
      className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-90"
    >
      {isDark ? (
        <ArrexiaLogo variant="dark" height={34} className="max-h-[34px]" priority />
      ) : (
        <ArrexiaLogo variant="light" height={34} className="max-h-[34px]" priority />
      )}
      <div>
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Founder Console
        </p>
      </div>
    </Link>
  );
}
