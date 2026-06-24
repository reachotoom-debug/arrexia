import Image from "next/image";
import Link from "next/link";

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
      <Image
        src="/brand/icon-logo.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-lg object-contain"
        priority
      />
      <div>
        <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
          FlowCollect
        </p>
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Founder Console
        </p>
      </div>
    </Link>
  );
}
